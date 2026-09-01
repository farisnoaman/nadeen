import { randomUUID } from 'node:crypto';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { companies, insurancePackages, insurancePackageVehicles, maintenanceWorkOrders, notifications, premiumServices, promotionVehicles, promotions, rentals, rentalServices, users, vehicleConditionLogs, vehicles } from '@/db/schema';
import { requireUser } from '@/lib/auth';
import {
  availabilitySuggestion, findTurnaroundConflict, getBusyPeriods,
  humanAvailability, serializeBusyPeriod, TURNAROUND_MINUTES, TURNAROUND_MS,
} from '@/lib/availability';
import { assignBookingNumber } from '@/lib/booking-number';
import { fail, ok } from '@/lib/http';
import { protectionPackage } from '@/lib/insurance';
import { findPickupLocation } from '@/lib/locations';
import { loyaltyBookingTerms } from '@/lib/loyalty';
import { effectiveKilometerPolicy } from '@/lib/kilometer-policy';
import { discountFor, endDate, promotionState, rateField, RateType } from '@/lib/pricing';
import { roundMoney } from '@/lib/rental-document';
import { assertBookableCompany, assertRentalRequestCapacity, companyEntitlement } from '@/lib/platform';
import { canonicalOdometer } from '@/lib/telemetry';

const rentalSelect = {
  id: rentals.id, vehicleId: rentals.vehicleId, renterId: rentals.renterId, bookingNumber: rentals.bookingNumber,
  status: rentals.status, rateType: rentals.rateType, quantity: rentals.quantity,
  startsAt: rentals.startsAt, endsAt: rentals.endsAt, subtotal: rentals.subtotal,
  discount: rentals.discount,
  loyaltyLevelId:rentals.loyaltyLevelId, loyaltyLevelName:rentals.loyaltyLevelName,
  loyaltyDiscountPercentage:rentals.loyaltyDiscountPercentage, loyaltyDiscount:rentals.loyaltyDiscount,
  loyaltyPointsRate:rentals.loyaltyPointsRate, loyaltyPointsEarned:rentals.loyaltyPointsEarned,
  extrasSubtotal: rentals.extrasSubtotal,
  bookingOdometer: rentals.bookingOdometer,
  renterOdometerAcknowledged: rentals.renterOdometerAcknowledged,
  renterOdometerAcknowledgedAt: rentals.renterOdometerAcknowledgedAt,
  confirmedAt: rentals.confirmedAt,
  renterSignatureName: rentals.renterSignatureName, renterSignedAt: rentals.renterSignedAt,
  handoverByRole: rentals.handoverByRole, handoverByUserId: rentals.handoverByUserId,
  invoiceIssuedAt: rentals.invoiceIssuedAt, paidAt: rentals.paidAt,
  protectionPackageId: rentals.protectionPackageId,
  protectionTier: rentals.protectionTier, protectionName: rentals.protectionName,
  protectionDailyPrice: rentals.protectionDailyPrice, protectionDays: rentals.protectionDays,
  protectionSubtotal: rentals.protectionSubtotal, protectionDeductible: rentals.protectionDeductible,
  protectionCoverage: rentals.protectionCoverage, extraDiscount: rentals.extraDiscount,
  fuelCharge: rentals.fuelCharge, pickupOdometer: rentals.pickupOdometer,
  returnOdometer: rentals.returnOdometer, pickupFuelLevel: rentals.pickupFuelLevel,
    returnFuelLevel: rentals.returnFuelLevel, dailyKilometerAllowance: rentals.dailyKilometerAllowance,
    allowedKilometers: rentals.allowedKilometers, excessKilometerRate: rentals.excessKilometerRate,
    kilometerPolicyId: rentals.kilometerPolicyId, kilometerPolicyName: rentals.kilometerPolicyName,
    excessDistanceCharge: rentals.excessDistanceCharge,
  total: rentals.total, promoCode: rentals.promoCode, promoDetails: rentals.promoDetails,
  currency: rentals.currency, exchangeRate: rentals.exchangeRate,
  invoiceToken: rentals.invoiceToken, pickupCity: rentals.pickupCity,
  pickupLocation: rentals.pickupLocation, returnCity: rentals.returnCity,
  returnLocation: rentals.returnLocation, createdAt: rentals.createdAt,
  make: vehicles.make, model: vehicles.model, year: vehicles.year, image: vehicles.image,
  licensePlate: vehicles.licensePlate, category: vehicles.category, companyId: vehicles.companyId,
  vehicleOdometer: vehicles.odometer, vehicleFuelLevel: vehicles.fuelLevel,
  fuelPolicy: vehicles.fuelPolicy, insuranceCoverage: vehicles.insuranceCoverage,
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
    const entitlement=await companyEntitlement(db,vehicle.companyId);
    assertBookableCompany(entitlement);
    assertRentalRequestCapacity(entitlement);

    const [companyCurrencyRow] = await db.select({
      baseCurrency: companies.baseCurrency,
      supportedCurrencies: companies.supportedCurrencies,
      exchangeRates: companies.exchangeRates,
    }).from(companies).where(eq(companies.id, vehicle.companyId)).limit(1);
    const baseCurrency = companyCurrencyRow?.baseCurrency || 'USD';
    const supportedCurrencies = companyCurrencyRow?.supportedCurrencies || ['USD'];
    const requestedCurrency = body.currency;
    const rentalCurrency = supportedCurrencies.includes(requestedCurrency) ? requestedCurrency : baseCurrency;
    const rentalExchangeRate = rentalCurrency === baseCurrency
      ? 1
      : Number(companyCurrencyRow?.exchangeRates?.[rentalCurrency] || 1);

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
    if (!vehicle.insurancePolicyExpiry || new Date(vehicle.insurancePolicyExpiry).getTime() < endsAt.getTime()) {
      throw new Error('This vehicle’s insurance policy does not remain valid through the selected return time.');
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

    const subtotal = roundMoney(Number(vehicle[rateField[type]]) * quantity);
    let discount = 0;
    const appliedPromoCodes: string[] = [];
    const appliedPromoIds: number[] = [];
    const appliedPromoDetails: { code: string; type: 'percentage' | 'fixed'; value: number; discount: number }[] = [];
    const promoCodes = Array.isArray(body.promoCodes) ? body.promoCodes : (body.promoCode ? [body.promoCode] : []);
    for (const rawCode of promoCodes) {
      if (!rawCode) continue;
      const [promo] = await db.select().from(promotions).where(and(
        eq(promotions.companyId, vehicle.companyId),
        eq(promotions.code, String(rawCode).toUpperCase()),
        isNull(promotions.archivedAt),
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
      const promoDiscount = roundMoney(discountFor(subtotal, promo));
      discount += promoDiscount;
      appliedPromoCodes.push(promo.code);
      appliedPromoIds.push(promo.id);
      appliedPromoDetails.push({ code: promo.code, type: promo.type, value: promo.value, discount: promoDiscount });
    }
    const promoCode = appliedPromoCodes.length > 0 ? appliedPromoCodes.join(',') : null;

    const rentalDays = Math.max(1, Math.ceil((endsAt.getTime() - startsAt.getTime()) / 86_400_000));
    const returnCity = String(body.returnCity || '').trim();
    const returnLocation = String(body.returnLocation || '').trim();
    if (returnCity.length < 2 || returnCity.length > 80) throw new Error('Enter a valid return city.');
    if (returnLocation.length < 2 || returnLocation.length > 120) throw new Error('Enter a valid return site.');
    const catalogPackages = await db.select().from(insurancePackages).where(eq(insurancePackages.companyId, vehicle.companyId));
    const catalogLinks = await db.select().from(insurancePackageVehicles).where(eq(insurancePackageVehicles.vehicleId, vehicle.id));
    const eligiblePackages = catalogPackages.filter((pkg: any) => pkg.active
      && (pkg.appliesTo === 'all' || catalogLinks.some((link: any) => link.packageId === pkg.id)));
    let protectionPackageId: number | null = null;
    let selectedProtection: any;
    if (eligiblePackages.length) {
      const requestedId = Number(body.protectionPackageId);
      selectedProtection = Number.isInteger(requestedId) && requestedId > 0
        ? eligiblePackages.find((pkg: any) => pkg.id === requestedId)
        : eligiblePackages.find((pkg: any) => pkg.tier === body.protectionTier) || eligiblePackages[0];
      if (!selectedProtection) throw new Error('The selected insurance package is not assigned to this vehicle.');
      protectionPackageId = selectedProtection.id;
    } else if (catalogPackages.length) {
      selectedProtection = protectionPackage([], 'basic', vehicle.insuranceDeductible);
      if (body.protectionPackageId) throw new Error('The selected insurance package is not assigned to this vehicle.');
    } else {
      selectedProtection = protectionPackage(vehicle.protectionPackages, body.protectionTier, vehicle.insuranceDeductible);
      if (body.protectionTier && selectedProtection.tier !== body.protectionTier) throw new Error('The selected protection package is unavailable for this vehicle.');
    }
    const protectionSubtotal = roundMoney(Number(selectedProtection.dailyPrice) * rentalDays);
    const requestedServices = Array.isArray(body.services)
      ? body.services.filter((item: any) => Number(item.days) > 0)
      : [];
    const serviceIds = [...new Set(requestedServices.map((item: any) => Number(item.serviceId)))] as number[];
    const catalog = serviceIds.length ? await db.select().from(premiumServices).where(inArray(premiumServices.id, serviceIds)) : [];
    const serviceLines = requestedServices.map((item: any) => {
      const service = catalog.find((entry: any) => entry.id === Number(item.serviceId));
      if (!service || service.companyId !== vehicle.companyId || !service.active) throw new Error('One of the selected premium services is unavailable.');
      const days = Math.max(1, Math.min(rentalDays, Math.floor(Number(item.days))));
      return { service, days, subtotal: roundMoney(Number(service.dailyPrice) * days) };
    });
    const extrasSubtotal = roundMoney(serviceLines.reduce((sum: number, line: any) => sum + line.subtotal, 0));

    const saved = await db.transaction(async (tx:any) => {
      // Serialize reservation creation per vehicle, then repeat the overlap check while holding the lock.
      // This closes the race where two renters pass the first availability check simultaneously.
      await tx.execute(sql`SELECT id FROM vehicles WHERE id = ${vehicle.id} FOR UPDATE`);
      const [lockedVehicle] = await tx.select({
        odometer: vehicles.odometer, location: vehicles.location,
        pickupLocations: vehicles.pickupLocations,
        dailyKilometerAllowance: vehicles.dailyKilometerAllowance,
        excessKilometerRate: vehicles.excessKilometerRate,
      }).from(vehicles).where(eq(vehicles.id, vehicle.id)).limit(1);
      const pickupLocation = findPickupLocation(
        lockedVehicle?.pickupLocations, body.pickupCity, body.pickupLocation, lockedVehicle?.location,
      );
      if (!pickupLocation) throw new Error('Choose an available pickup city and site for this vehicle.');
      const mileagePolicy = await effectiveKilometerPolicy(tx, vehicle.companyId, vehicle.id);
      const dailyKilometerAllowance = Math.max(0, Number(mileagePolicy?.dailyKilometerAllowance ?? lockedVehicle.dailyKilometerAllowance ?? 0));
      const allowedKilometers = dailyKilometerAllowance * rentalDays;
      const excessKilometerRate = Math.max(0, Number(mileagePolicy?.excessKilometerRate ?? lockedVehicle.excessKilometerRate ?? 0));
      const recordedReadings = await tx.select({
        id: vehicleConditionLogs.id, vehicleId: vehicleConditionLogs.vehicleId,
        eventType: vehicleConditionLogs.eventType, odometer: vehicleConditionLogs.odometer,
        fuelAddedLiters: vehicleConditionLogs.fuelAddedLiters, fuelCost: vehicleConditionLogs.fuelCost,
        createdAt: vehicleConditionLogs.createdAt,
      }).from(vehicleConditionLogs).where(eq(vehicleConditionLogs.vehicleId, vehicle.id));
      // This reading is informational on the quotation. The binding reading is
      // recorded and signed at the physical pickup handover.
      const bookingOdometer = canonicalOdometer(lockedVehicle?.odometer, recordedReadings);
      const latestPeriods = await getBusyPeriods(tx, vehicle.id);
      if (findTurnaroundConflict(latestPeriods, startsAt, endsAt)) {
        throw new Error(`This vehicle was just reserved. Refresh availability; a ${TURNAROUND_MINUTES}-minute gap is required between rentals.`);
      }
      const loyalty = await loyaltyBookingTerms(tx, vehicle.companyId, user.id, subtotal, discount);
      const bookingNumber = await assignBookingNumber(tx, vehicle.companyId);
      const [row] = await tx.insert(rentals).values({
        vehicleId: vehicle.id, renterId: user.id, status: 'pending', rateType: type, bookingNumber,
        quantity, startsAt, endsAt, subtotal, discount,
        currency: rentalCurrency, exchangeRate: rentalExchangeRate,
        loyaltyLevelId:loyalty.levelId, loyaltyLevelName:loyalty.levelName,
        loyaltyDiscountPercentage:loyalty.discountPercentage, loyaltyDiscount:loyalty.discount,
        loyaltyPointsRate:loyalty.pointsRate, loyaltyPointsEarned:0,
        extrasSubtotal,
        bookingOdometer, renterOdometerAcknowledged:false, renterOdometerAcknowledgedAt:null,
        confirmedAt:null, renterSignatureName:null, renterSignedAt:null,
        handoverByRole:null, handoverByUserId:null, invoiceIssuedAt:null, paidAt:null,
        protectionPackageId, protectionTier: selectedProtection.tier, protectionName: selectedProtection.name,
        protectionDailyPrice: selectedProtection.dailyPrice, protectionDays: rentalDays,
        protectionSubtotal, protectionDeductible: selectedProtection.deductible,
        protectionCoverage: selectedProtection.coverage, extraDiscount: 0, fuelCharge: 0,
        dailyKilometerAllowance, allowedKilometers, excessKilometerRate,
        kilometerPolicyId:mileagePolicy?.id || null,
        kilometerPolicyName:mileagePolicy?.name || 'Vehicle mileage terms',
        excessDistanceCharge: 0, total: roundMoney(subtotal + extrasSubtotal + protectionSubtotal - discount - loyalty.discount),
        invoiceToken: randomUUID(), promoCode, promoDetails: appliedPromoDetails,
        pickupCity: pickupLocation.city, pickupLocation: pickupLocation.site,
        returnCity, returnLocation,
      }).returning();
      let savedServices: any[] = [];
      if (serviceLines.length) {
        savedServices = await tx.insert(rentalServices).values(serviceLines.map((line: any) => ({
          rentalId: row.id, serviceId: line.service.id, name: line.service.name,
          unitPrice: line.service.dailyPrice, days: line.days, discount: 0, subtotal: line.subtotal,
        }))).returning();
      }
      for (const pid of appliedPromoIds) {
        await tx.update(promotions).set({ redemptions: sql`${promotions.redemptions} + 1` })
          .where(eq(promotions.id, pid));
      }
      await tx.insert(notifications).values({
        companyId: vehicle.companyId,
        type: 'rental_created',
        body: `${user.name} · ${vehicle.make} ${vehicle.model} · ${bookingNumber ?? `FF-${row.id}`}`,
        href: '/dashboard/rentals',
        entityType: 'rental',
        entityId: row.id,
        dedupeKey: `rental-created-${row.id}`,
      });
      return { row, savedServices };
    });
    return ok({ rental: { ...saved.row, services: saved.savedServices }, turnaroundMinutes: TURNAROUND_MINUTES }, 201);
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
