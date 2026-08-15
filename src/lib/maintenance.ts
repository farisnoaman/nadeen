import { and, eq, inArray } from 'drizzle-orm';
import { maintenanceItems, maintenanceWorkOrders, notifications, rentals, vehicles } from '@/db/schema';
import { TURNAROUND_MS } from './availability';

export const DEFAULT_MAINTENANCE_ITEMS = [
  { key: 'engine-oil', name: 'Engine oil & oil filter', description: 'Replace engine oil and oil filter; inspect for leaks and verify fluid level.', intervalDays: 180, intervalKm: 10000, defaultDurationHours: 1.5 },
  { key: 'air-filter', name: 'Engine air filter', description: 'Inspect and replace the engine intake air filter when contaminated.', intervalDays: 365, intervalKm: 20000, defaultDurationHours: 0.75 },
  { key: 'fuel-filter', name: 'Fuel filter', description: 'Inspect and replace the fuel filter according to powertrain requirements.', intervalDays: 365, intervalKm: 30000, defaultDurationHours: 1.25 },
  { key: 'battery', name: 'Battery inspection & maintenance', description: 'Test battery health and charging output; clean terminals and secure connections.', intervalDays: 180, intervalKm: 15000, defaultDurationHours: 1 },
  { key: 'brakes', name: 'Brake pads & braking system', description: 'Inspect pad thickness, discs, brake fluid, lines, and parking brake operation.', intervalDays: 180, intervalKm: 20000, defaultDurationHours: 2.5 },
  { key: 'tires', name: 'Tire rotation & inspection', description: 'Rotate tires; inspect pressure, tread depth, alignment wear, and wheel condition.', intervalDays: 180, intervalKm: 10000, defaultDurationHours: 1 },
  { key: 'fluids', name: 'Coolant & operating fluids', description: 'Inspect coolant, brake, steering, washer, and differential fluid condition and levels.', intervalDays: 180, intervalKm: 15000, defaultDurationHours: 1 },
  { key: 'cabin-filter', name: 'Cabin filter & A/C inspection', description: 'Replace cabin filter and verify heating, ventilation, and air-conditioning performance.', intervalDays: 365, intervalKm: 15000, defaultDurationHours: 1 },
  { key: 'transmission', name: 'Transmission service', description: 'Inspect transmission operation and replace fluid and filter when specified.', intervalDays: 730, intervalKm: 60000, defaultDurationHours: 3 },
  { key: 'spark-plugs', name: 'Spark plugs & ignition', description: 'Inspect ignition components and replace spark plugs for applicable powertrains.', intervalDays: 730, intervalKm: 40000, defaultDurationHours: 2 },
  { key: 'safety-inspection', name: 'General safety inspection', description: 'Inspect lights, wipers, belts, suspension, steering, horn, emergency kit, and roadworthiness.', intervalDays: 180, intervalKm: 10000, defaultDurationHours: 1.5 },
] as const;

export async function ensureMaintenanceCatalog(db: any, companyId: number) {
  const existing = await db.select().from(maintenanceItems)
    .where(eq(maintenanceItems.companyId, companyId));
  const keys = new Set(existing.map((item: any) => item.key));
  const missing = DEFAULT_MAINTENANCE_ITEMS.filter(item => !keys.has(item.key));
  if (missing.length) {
    await db.insert(maintenanceItems).values(missing.map(item => ({ ...item, companyId })));
  }
  return db.select().from(maintenanceItems).where(eq(maintenanceItems.companyId, companyId));
}

export async function ensureInitialMaintenanceSchedule(db: any, companyId: number) {
  const existing = await db.select({ id: maintenanceWorkOrders.id }).from(maintenanceWorkOrders)
    .where(eq(maintenanceWorkOrders.companyId, companyId)).limit(1);
  if (existing.length) return;
  const catalog = await ensureMaintenanceCatalog(db, companyId);
  const fleet = await db.select().from(vehicles).where(eq(vehicles.companyId, companyId));
  if (!fleet.length) return;
  const taskKeys = ['engine-oil', 'brakes', 'battery', 'tires', 'safety-inspection'];
  const offsets = [-1, 6, 14, 25, 40];
  const now = new Date();
  const vehicleIds = fleet.slice(0, 5).map((vehicle: any) => vehicle.id);
  const reservations = vehicleIds.length ? await db.select().from(rentals).where(and(
    inArray(rentals.vehicleId, vehicleIds),
    inArray(rentals.status, ['pending', 'active']),
  )) : [];
  const values = fleet.slice(0, 5).map((vehicle: any, index: number) => {
    const item = catalog.find((entry: any) => entry.key === taskKeys[index]) || catalog[index % catalog.length];
    const dueAt = new Date(now.getTime() + offsets[index] * 86_400_000);
    let scheduledAt = new Date(dueAt.getTime() - 2 * 86_400_000);
    const durationHours = Number(item.defaultDurationHours || 1);
    const relevantRental = reservations
      .filter((rental: any) => rental.vehicleId === vehicle.id && new Date(rental.endsAt) >= now && dueAt <= new Date(rental.endsAt))
      .sort((a: any, b: any) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())[0];
    if (relevantRental) {
      const beforePickup = new Date(new Date(relevantRental.startsAt).getTime() - TURNAROUND_MS - durationHours * 3_600_000);
      scheduledAt = beforePickup > now ? beforePickup : new Date(new Date(relevantRental.endsAt).getTime() + TURNAROUND_MS);
    }
    return {
      companyId,
      vehicleId: vehicle.id,
      itemId: item.id,
      title: item.name,
      description: item.description,
      status: 'scheduled' as const,
      priority: index === 0 ? 'urgent' as const : index < 3 ? 'soon' as const : 'routine' as const,
      dueAt,
      dueOdometer: vehicle.odometer + Number(item.intervalKm || 10000),
      scheduledAt,
      durationHours,
      recurrenceDays: item.intervalDays,
      recurrenceKm: item.intervalKm,
      notes: index === 0 ? 'Initial maintenance plan generated from current fleet mileage.' : 'Automatically generated preventive-maintenance schedule.',
    };
  });
  if (values.length) await db.insert(maintenanceWorkOrders).values(values);
}

export type MaintenanceConflict = {
  rentalId: number;
  rentalStatus: string;
  rentalStartsAt: Date;
  rentalEndsAt: Date;
  kind: 'active_rental' | 'upcoming_rental' | 'workshop_overlap';
  mustCompleteBy: Date | null;
  suggestedAt: Date;
};

export function maintenanceEnd(order: { scheduledAt: Date | string; durationHours: number }) {
  return new Date(new Date(order.scheduledAt).getTime() + Number(order.durationHours || 1) * 3_600_000);
}

export function findMaintenanceRentalConflict(order: any, reservationRows: any[], now = new Date()): MaintenanceConflict | null {
  const scheduledAt = new Date(order.scheduledAt);
  const scheduledEnd = maintenanceEnd(order);
  const dueAt = new Date(order.dueAt);
  const reservations = reservationRows
    .filter(row => row.vehicleId === order.vehicleId && ['pending', 'active'].includes(row.status))
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());

  for (const rental of reservations) {
    const startsAt = new Date(rental.startsAt);
    const endsAt = new Date(rental.endsAt);
    const protectedStart = new Date(startsAt.getTime() - TURNAROUND_MS);
    const protectedEnd = new Date(endsAt.getTime() + TURNAROUND_MS);
    const workshopOverlap = scheduledAt < protectedEnd && scheduledEnd > protectedStart;
    const maintenanceDueByReturn = dueAt <= endsAt;
    const completedBeforePickup = scheduledEnd <= protectedStart;
    if (!workshopOverlap && (!maintenanceDueByReturn || completedBeforePickup)) continue;

    const active = startsAt <= now && endsAt > now;
    const beforePickup = new Date(startsAt.getTime() - TURNAROUND_MS - Number(order.durationHours || 1) * 3_600_000);
    const suggestedAt = active || beforePickup <= now
      ? new Date(endsAt.getTime() + TURNAROUND_MS)
      : beforePickup;
    return {
      rentalId: rental.id,
      rentalStatus: rental.status,
      rentalStartsAt: startsAt,
      rentalEndsAt: endsAt,
      kind: active ? 'active_rental' : workshopOverlap ? 'workshop_overlap' : 'upcoming_rental',
      mustCompleteBy: active ? null : protectedStart,
      suggestedAt,
    };
  }
  return null;
}

export async function syncMaintenanceNotifications(db: any, companyId: number) {
  const orders = await db.select({
    id: maintenanceWorkOrders.id,
    vehicleId: maintenanceWorkOrders.vehicleId,
    title: maintenanceWorkOrders.title,
    dueAt: maintenanceWorkOrders.dueAt,
    dueOdometer: maintenanceWorkOrders.dueOdometer,
    scheduledAt: maintenanceWorkOrders.scheduledAt,
    durationHours: maintenanceWorkOrders.durationHours,
    status: maintenanceWorkOrders.status,
    make: vehicles.make,
    model: vehicles.model,
    odometer: vehicles.odometer,
  }).from(maintenanceWorkOrders)
    .innerJoin(vehicles, eq(maintenanceWorkOrders.vehicleId, vehicles.id))
    .where(and(
      eq(maintenanceWorkOrders.companyId, companyId),
      inArray(maintenanceWorkOrders.status, ['scheduled', 'in_progress']),
    ));
  if (!orders.length) return;
  const vehicleIds = [...new Set(orders.map((order: any) => order.vehicleId))] as number[];
  const reservationRows = await db.select({
    id: rentals.id,
    vehicleId: rentals.vehicleId,
    startsAt: rentals.startsAt,
    endsAt: rentals.endsAt,
    status: rentals.status,
  }).from(rentals).where(and(
    inArray(rentals.vehicleId, vehicleIds),
    inArray(rentals.status, ['pending', 'active']),
  ));
  const now = new Date();
  const reminderLimit = new Date(now.getTime() + 30 * 86_400_000);
  const dayKey = now.toISOString().slice(0, 10);

  for (const order of orders as any[]) {
    const dueAt = new Date(order.dueAt);
    const mileageRemaining = order.dueOdometer ? Number(order.dueOdometer) - Number(order.odometer || 0) : null;
    const mileageDueSoon = mileageRemaining !== null && mileageRemaining <= 1_000;
    if (dueAt <= reminderLimit || mileageDueSoon) {
      const overdue = dueAt < now || (mileageRemaining !== null && mileageRemaining <= 0);
      await db.insert(notifications).values({
        companyId,
        type: overdue ? 'maintenance_overdue' : 'maintenance_due',
        body: `${order.make} ${order.model} · ${order.title} · ${dueAt.toISOString().slice(0, 10)}`,
        href: `/dashboard/maintenance?workOrder=${order.id}`,
        entityType: 'maintenance_work_order',
        entityId: order.id,
        dedupeKey: `maintenance-${overdue ? 'overdue' : 'due'}-${order.id}-${dayKey}`,
      }).onConflictDoNothing();
    }
    const conflict = findMaintenanceRentalConflict(order, reservationRows, now);
    if (conflict) {
      await db.insert(notifications).values({
        companyId,
        type: 'maintenance_conflict',
        body: `${order.make} ${order.model} · ${order.title} · FF-${String(conflict.rentalId).padStart(4, '0')}`,
        href: `/dashboard/maintenance?workOrder=${order.id}`,
        entityType: 'maintenance_work_order',
        entityId: order.id,
        dedupeKey: `maintenance-conflict-${order.id}-${conflict.rentalId}`,
      }).onConflictDoNothing();
    }
  }
}
