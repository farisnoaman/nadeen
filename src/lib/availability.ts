import { and, asc, eq, inArray } from 'drizzle-orm';
import { maintenanceWorkOrders, rentals } from '@/db/schema';

export const TURNAROUND_MINUTES = 60;
export const TURNAROUND_MS = TURNAROUND_MINUTES * 60 * 1000;
export const BLOCKING_STATUSES = ['pending', 'active'] as const;

export type BusyPeriod = {
  id: number;
  startsAt: Date;
  endsAt: Date;
  status: 'pending' | 'active' | 'maintenance';
  source: 'rental' | 'maintenance';
  blockedFrom: Date;
  blockedUntil: Date;
};

export async function getBusyPeriods(db: any, vehicleId: number): Promise<BusyPeriod[]> {
  const rows = await db.select({
    id: rentals.id,
    startsAt: rentals.startsAt,
    endsAt: rentals.endsAt,
    status: rentals.status,
  }).from(rentals).where(and(
    eq(rentals.vehicleId, vehicleId),
    inArray(rentals.status, [...BLOCKING_STATUSES]),
  )).orderBy(asc(rentals.startsAt));

  const workshopRows = await db.select({
    id: maintenanceWorkOrders.id,
    startsAt: maintenanceWorkOrders.scheduledAt,
    durationHours: maintenanceWorkOrders.durationHours,
  }).from(maintenanceWorkOrders).where(and(
    eq(maintenanceWorkOrders.vehicleId, vehicleId),
    inArray(maintenanceWorkOrders.status, ['scheduled', 'in_progress']),
  )).orderBy(asc(maintenanceWorkOrders.scheduledAt));

  const rentalPeriods: BusyPeriod[] = rows.map((row: any) => ({
    ...row,
    source: 'rental',
    blockedFrom: new Date(new Date(row.startsAt).getTime() - TURNAROUND_MS),
    blockedUntil: new Date(new Date(row.endsAt).getTime() + TURNAROUND_MS),
  }));
  const maintenancePeriods: BusyPeriod[] = workshopRows.map((row: any) => {
    const startsAt = new Date(row.startsAt);
    const endsAt = new Date(startsAt.getTime() + Number(row.durationHours || 1) * 3_600_000);
    return {
      id: row.id,
      startsAt,
      endsAt,
      status: 'maintenance',
      source: 'maintenance',
      blockedFrom: new Date(startsAt.getTime() - TURNAROUND_MS),
      blockedUntil: new Date(endsAt.getTime() + TURNAROUND_MS),
    };
  });
  return [...rentalPeriods, ...maintenancePeriods]
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

export function findTurnaroundConflict(periods: BusyPeriod[], startsAt: Date, endsAt: Date) {
  return periods.find((period) =>
    startsAt.getTime() < new Date(period.blockedUntil).getTime() &&
    endsAt.getTime() > new Date(period.blockedFrom).getTime()
  );
}

export function availabilitySuggestion(periods: BusyPeriod[], startsAt: Date) {
  const startMs = startsAt.getTime();
  const containing = periods.find((period) =>
    startMs >= new Date(period.blockedFrom).getTime() &&
    startMs < new Date(period.blockedUntil).getTime()
  );
  if (containing) {
    return {
      available: false,
      availableUntil: null,
      nextAvailableAt: new Date(containing.blockedUntil),
      availableMilliseconds: 0,
      availableCalendarDays: 0,
    };
  }

  const next = periods.find((period) => new Date(period.blockedFrom).getTime() > startMs);
  const availableUntil = next
    ? new Date(next.blockedFrom)
    : null;
  const duration = availableUntil ? Math.max(0, availableUntil.getTime() - startMs) : null;
  return {
    available: true,
    availableUntil,
    nextAvailableAt: null,
    availableMilliseconds: duration,
    availableCalendarDays: duration === null ? null : Math.max(0, Math.ceil(duration / 86_400_000)),
  };
}

export function humanAvailability(milliseconds: number) {
  const totalHours = Math.max(0, Math.floor(milliseconds / 3_600_000));
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  if (days && hours) return `${days} day${days === 1 ? '' : 's'} and ${hours} hour${hours === 1 ? '' : 's'}`;
  if (days) return `${days} day${days === 1 ? '' : 's'}`;
  return `${hours} hour${hours === 1 ? '' : 's'}`;
}

export function serializeBusyPeriod(period: BusyPeriod) {
  return {
    id: period.id,
    startsAt: period.startsAt,
    endsAt: period.endsAt,
    status: period.status,
    source: period.source,
    blockedFrom: period.blockedFrom,
    blockedUntil: period.blockedUntil,
    turnaroundMinutes: TURNAROUND_MINUTES,
  };
}
