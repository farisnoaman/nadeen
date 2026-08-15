import { randomUUID } from 'node:crypto';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { companies, maintenanceWorkOrders, notifications, premiumServices, promotionVehicles, promotions, rentals, rentalServices, users, vehicles } from '@/db/schema';
import { requireUser } from '@/lib/auth';
import {
  availabilitySuggestion, findTurnaroundConflict, getBusyPeriods,
  humanAvailability, serializeBusyPeriod, TURNAROUND_MINUTES, TURNAROUND_MS,
} from '@/lib/availability';
import { fail, ok } from '@/lib/http';
import { discountFor, endDate, promotionState, rateField, RateType } from '@/lib/pricing';

const rentalSelect = {
  id: rentals.id, vehicleId: rentals.vehicleId, renterId: rentals.renterId,
  status: rentals.status, rateType: rentals.rateType, quantity: rentals.quantity,
  startsAt: rentals.startsAt, endsAt: rentals.endsAt, subtotal: rentals.subtotal,
  discount: rentals.discount, extrasSubtotal: rentals.extrasSubtotal,
  extraDiscount: rentals.extraDiscount, total: rentals.total, promoCode: rentals.promoCode,
  invoiceToken: rentals.invoiceToken, pickupLocation: rentals.pickupLocation, createdAt: rentals.createdAt,
  make: vehicles.make, model: vehicles.model, year: vehicles.year, image: vehicles.image,
  licensePlate: vehicles.licensePlate, category: vehicles.category, companyId: vehicles.companyId,
  companyName: companies.name, customer: users.name, customerEmail: users.email, avatar: users.avatar,
};

export async function GET() {
  try {
    const user = await requireUser();
    const db = await getDb();
    const condition = user.role === 'company'
      ? eq(vehicles.companyId, user.companyId!)
      : eq(rentals.renterId, user.id);
    const rows = await db.select(rentalSelect).from(rentals)
      .innerJoin(vehicles, eq(rentals.vehicleId, vehicles.id))
      .innerJoin(companies, eq(vehicles.companyId, companies.id))
      .innerJoin(users, eq(rentals.renterId, users.id))
      .where(condition).orderBy(desc(rentals.createdAt));
    const ids = rows.map((row: any) => row.id);
    const extras = ids.length ? await db.select().from(rentalServices).where(inArray(rentalServices.rentalId, ids)) : [];
    return ok({ rentals: rows.map((row: any) => ({
      ...row,
      services: extras.filter((extra: any) => extra.rentalId === row.id),
    })), turnaroundMinutes: TURNAROUND_MINUTES });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser('renter');
    const body = await request.json();
    const db = await getDb();
    const [vehicle] = await db.select().from(vehicles)
      .where(eq(vehicles.id, Number(body.vehicleId))).limit(1);
    if (!vehicle || vehicle.status !== 'available') throw new Error('This vehicle is not available.');

    const type = body.rateType as RateType;
    if (!['hour', 'day', 'week', 'month'].includes(type)) throw new Error('Choose a valid rate type.');
    const quantity = Math.max(1, Number(body.quantity) || 1);
    const startsAt = new Date(body.startsAt);
    if (Number.isNaN(startsAt.getTime())) throw new Error('Choose a valid pick-up time.');
    if (startsAt.getTime() < Date.now() - 60_000) throw new Error('Pick-up time must be in the future.');

    const calculatedEnd = endDate(startsAt, type, quantity);
    let endsAt = body.endsAt ? new Date(body.endsAt) : calculatedEnd;
    if (Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) throw new Error('Choose a valid return time.');
    if (endsAt > calculatedEnd) endsAt = calculatedEnd;
    // A range may be shortened by at most the one-hour turnaround when it meets the next booking.
    if (calculatedEnd.getTime() - endsAt.getTime() > TURNAROUND_MS + 60_000) {
      throw new Error('The selected range is shorter than the chosen rental duration.');
    }

    const periods = await getBusyPeriods(db, vehicle.id);
    const conflict = findTurnaroundConflict(periods, startsAt, endsAt);
    if (conflict) {
      const suggestion = availabilitySuggestion(periods, startsAt);
      const availableText = suggestion.availableMilliseconds
        ? humanAvailability(suggestion.availableMilliseconds)
        : null;
      return ok({
        error: conflict.source === 'maintenance'
          ? `The vehicle has protected workshop maintenance at that time. It is next ready at ${suggestion.nextAvailableAt?.toISOString()}.`
          : suggestion.available
            ? `Only ${availableText} is available before the next reservation, including the ${TURNAROUND_MINUTES}-minute vehicle turnaround.`
            : `The vehicle is unavailable at that time. It is next ready at ${suggestion.nextAvailableAt?.toISOString()}.`,
        code: 'RESERVATION_OVERLAP',
        requested: { startsAt, endsAt },
        availability: suggestion,
        conflictingPeriod: serializeBusyPeriod(conflict),
        turnaroundMinutes: TURNAROUND_MINUTES,
      }, 409);
    }

    const maintenancePlans = await db.select().from(maintenanceWorkOrders).where(and(
      eq(maintenanceWorkOrders.vehicleId, vehicle.id),
      inArray(maintenanceWorkOrders.status, ['scheduled', 'in_progress']),
    ));
    const maintenanceDeadline = maintenancePlans.find((plan: any) => {
      const dueAt = new Date(plan.dueAt);
      const workshopEnd = new Date(new Date(plan.scheduledAt).getTime() + Number(plan.durationHours || 1) * 3_600_000);
      return dueAt <= endsAt && workshopEnd.getTime() > startsAt.getTime() - TURNAROUND_MS;
    });
    if (maintenanceDeadline) {
      return ok({
        error: `Required maintenance (${maintenanceDeadline.title}) must be completed before this reservation can begin.`,
        code: 'MAINTENANCE_REQUIRED',
        maintenance: {
          id: maintenanceDeadline.id,
          title: maintenanceDeadline.title,
          dueAt: maintenanceDeadline.dueAt,
          scheduledAt: maintenanceDeadline.scheduledAt,
        },
        turnaroundMinutes: TURNAROUND_MINUTES,
      }, 409);
    }

    const subtotal = Number(vehicle[rateField[type]]) * quantity;
    let discount = 0;
    let promoCode: string | null = null;
    let promoId: number | null = null;
    if (body.promoCode) {
      const [promo] = await db.select().from(promotions).where(and(
        eq(promotions.companyId, vehicle.companyId),
        eq(promotions.code, String(body.promoCode).toUpperCase()),
      )).limit(1);
      if (!promo || promotionState(promo) !== 'live' || quantity < promo.minQuantity) {
        throw new Error('This promotion is not valid for this booking.');
      }
      if (promo.appliesTo === 'selected') {
        const [link] = await db.select().from(promotionVehicles).where(and(
          eq(promotionVehicles.promotionId, promo.id),
          eq(promotionVehicles.vehicleId, vehicle.id),
        )).limit(1);
        if (!link) throw new Error('This promotion does not apply to this vehicle.');
      }
      discount = discountFor(subtotal, promo);
      promoCode = promo.code;
      promoId = promo.id;
    }

    const rentalDays = Math.max(1, Math.ceil((endsAt.getTime() - startsAt.getTime()) / 86_400_000));
    const requestedServices = Array.isArray(body.services)
      ? body.services.filter((item: any) => Number(item.days) > 0)
      : [];
    const serviceIds = [...new Set(requestedServices.map((item: any) => Number(item.serviceId)))] as number[];
    const catalog = serviceIds.length ? await db.select().from(premiumServices).where(inArray(premiumServices.id, serviceIds)) : [];
    const serviceLines = requestedServices.map((item: any) => {
      const service = catalog.find((entry: any) => entry.id === Number(item.serviceId));
      if (!service || service.companyId !== vehicle.companyId || !service.active) throw new Error('One of the selected premium services is unavailable.');
      const days = Math.max(1, Math.min(rentalDays, Math.floor(Number(item.days))));
      return { service, days, subtotal: Number(service.dailyPrice) * days };
    });
    const extrasSubtotal = serviceLines.reduce((sum: number, line: any) => sum + line.subtotal, 0);

    const [row] = await db.insert(rentals).values({
      vehicleId: vehicle.id, renterId: user.id, status: 'pending', rateType: type,
      quantity, startsAt, endsAt, subtotal, discount, extrasSubtotal, extraDiscount: 0,
      total: subtotal + extrasSubtotal - discount, invoiceToken: randomUUID(),
      promoCode, pickupLocation: vehicle.location,
    }).returning();
    let savedServices: any[] = [];
    if (serviceLines.length) {
      savedServices = await db.insert(rentalServices).values(serviceLines.map((line: any) => ({
        rentalId: row.id, serviceId: line.service.id, name: line.service.name,
        unitPrice: line.service.dailyPrice, days: line.days, discount: 0, subtotal: line.subtotal,
      }))).returning();
    }
    if (promoId) {
      await db.update(promotions).set({ redemptions: sql`${promotions.redemptions} + 1` })
        .where(eq(promotions.id, promoId));
    }
    await db.insert(notifications).values({
      companyId: vehicle.companyId,
      type: 'rental_created',
      body: `${user.name} · ${vehicle.make} ${vehicle.model} · FF-${String(row.id).padStart(4, '0')}`,
      href: '/dashboard/rentals',
      entityType: 'rental',
      entityId: row.id,
      dedupeKey: `rental-created-${row.id}`,
    });
    return ok({ rental: { ...row, services: savedServices }, turnaroundMinutes: TURNAROUND_MINUTES }, 201);
  } catch (error: any) {
    if (String(error?.message).includes('rentals_no_overlap') || String(error?.message).includes('conflicting key')) {
      return ok({
        error: 'Those dates were just booked by someone else. The one-hour turnaround window is also protected. Please choose another period.',
        code: 'RESERVATION_OVERLAP',
        turnaroundMinutes: TURNAROUND_MINUTES,
      }, 409);
    }
    return fail(error);
  }
}
