import { and, desc, eq, inArray } from 'drizzle-orm';
import { getDb } from '@/db';
import { companies, promotionVehicles, promotions, rentals, users, vehicles } from '@/db/schema';
import { requireUser } from '@/lib/auth';
import { getBusyPeriods, serializeBusyPeriod, TURNAROUND_MINUTES } from '@/lib/availability';
import { fail, ok } from '@/lib/http';
import { promotionState } from '@/lib/pricing';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const db = await getDb();
    const [row] = await db.select({
      id: vehicles.id, companyId: vehicles.companyId, companyName: companies.name,
      make: vehicles.make, model: vehicles.model, trim: vehicles.trim, year: vehicles.year, category: vehicles.category,
      bodyType: vehicles.bodyType, gearbox: vehicles.gearbox, drivetrain: vehicles.drivetrain,
      steeringType: vehicles.steeringType, fuel: vehicles.fuel, seats: vehicles.seats, color: vehicles.color,
      licensePlate: vehicles.licensePlate, odometer: vehicles.odometer, location: vehicles.location,
      features: vehicles.features, image: vehicles.image, status: vehicles.status,
      hourlyRate: vehicles.hourlyRate, dailyRate: vehicles.dailyRate,
      weeklyRate: vehicles.weeklyRate, monthlyRate: vehicles.monthlyRate, rating: vehicles.rating,
    }).from(vehicles).innerJoin(companies, eq(vehicles.companyId, companies.id))
      .where(eq(vehicles.id, Number(id))).limit(1);

    if (!row || (user.role === 'company' && row.companyId !== user.companyId)) {
      return ok({ error: 'Vehicle not found' }, 404);
    }

    const history = await db.select({
      id: rentals.id, status: rentals.status, rateType: rentals.rateType, quantity: rentals.quantity,
      startsAt: rentals.startsAt, endsAt: rentals.endsAt, subtotal: rentals.subtotal,
      discount: rentals.discount, total: rentals.total, promoCode: rentals.promoCode,
      createdAt: rentals.createdAt, customer: users.name, customerEmail: users.email, avatar: users.avatar,
    }).from(rentals).innerJoin(users, eq(rentals.renterId, users.id))
      .where(eq(rentals.vehicleId, row.id)).orderBy(desc(rentals.startsAt));

    const promoRows = await db.select().from(promotions).where(eq(promotions.companyId, row.companyId));
    const links = await db.select().from(promotionVehicles).where(eq(promotionVehicles.vehicleId, row.id));
    const eligible = promoRows
      .filter((promo: any) => promotionState(promo) === 'live' &&
        (promo.appliesTo === 'all' || links.some((link: any) => link.promotionId === promo.id)))
      .map((promo: any) => ({ ...promo, state: promotionState(promo) }));
    const busyPeriods = await getBusyPeriods(db, row.id);

    return ok({
      vehicle: row,
      history,
      userRole: user.role,
      promotions: eligible,
      busyPeriods: busyPeriods.map(serializeBusyPeriod),
      turnaroundMinutes: TURNAROUND_MINUTES,
      analytics: {
        trips: history.filter((r: any) => r.status === 'completed').length,
        revenue: history.filter((r: any) => r.status !== 'cancelled').reduce((sum: number, r: any) => sum + r.total, 0),
        active: history.filter((r: any) => ['pending', 'active'].includes(r.status)).length,
      },
    });
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser('company');
    const { id } = await params;
    const db = await getDb();
    const [existing] = await db.select().from(vehicles)
      .where(and(eq(vehicles.id, Number(id)), eq(vehicles.companyId, user.companyId!))).limit(1);
    if (!existing) return ok({ error: 'Vehicle not found' }, 404);

    const body = await request.json();
    const data: any = {};
    for (const key of ['make', 'model', 'trim', 'category', 'bodyType', 'gearbox', 'drivetrain', 'steeringType', 'fuel', 'color', 'licensePlate', 'location', 'image', 'status']) {
      if (body[key] !== undefined) data[key] = key === 'licensePlate' ? String(body[key]).toUpperCase() : body[key];
    }
    for (const key of ['year', 'seats', 'odometer', 'hourlyRate', 'dailyRate', 'weeklyRate', 'monthlyRate']) {
      if (body[key] !== undefined) data[key] = Number(body[key]);
    }
    if (body.features !== undefined) data.features = body.features;
    const [updated] = await db.update(vehicles).set(data).where(eq(vehicles.id, existing.id)).returning();
    return ok({ vehicle: updated });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser('company');
    const { id } = await params;
    const db = await getDb();
    const [vehicle] = await db.select().from(vehicles)
      .where(and(eq(vehicles.id, Number(id)), eq(vehicles.companyId, user.companyId!))).limit(1);
    if (!vehicle) return ok({ error: 'Vehicle not found' }, 404);

    const current = await db.select({ id: rentals.id }).from(rentals)
      .where(and(eq(rentals.vehicleId, vehicle.id), inArray(rentals.status, ['pending', 'active']))).limit(1);
    if (current.length) throw new Error('Vehicle is booked and cannot be deleted.');
    const anyHistory = await db.select({ id: rentals.id }).from(rentals)
      .where(eq(rentals.vehicleId, vehicle.id)).limit(1);
    if (anyHistory.length) throw new Error('Vehicle history is preserved. Mark it retired instead.');
    await db.delete(vehicles).where(eq(vehicles.id, vehicle.id));
    return ok({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
