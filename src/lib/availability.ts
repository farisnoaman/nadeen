import { and, asc, eq, inArray } from 'drizzle-orm';
import { rentals } from '@/db/schema';

export const TURNAROUND_MINUTES = 60;
export const TURNAROUND_MS = TURNAROUND_MINUTES * 60 * 1000;
export const BLOCKING_STATUSES = ['pending', 'active'] as const;

export type BusyPeriod = {
  id: number;
  startsAt: Date;
  endsAt: Date;
  status: 'pending' | 'active';
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

  return rows.map((row: any) => ({
    ...row,
    blockedFrom: new Date(new Date(row.startsAt).getTime() - TURNAROUND_MS),
    blockedUntil: new Date(new Date(row.endsAt).getTime() + TURNAROUND_MS),
  }));
}

export function findTurnaroundConflict(periods: BusyPeriod[], startsAt: Date, endsAt: Date) {
  return periods.find((period) =>
    startsAt.getTime() < new Date(period.endsAt).getTime() + TURNAROUND_MS &&
    endsAt.getTime() + TURNAROUND_MS > new Date(period.startsAt).getTime()
  );
}

export function availabilitySuggestion(periods: BusyPeriod[], startsAt: Date) {
  const startMs = startsAt.getTime();
  const containing = periods.find((period) =>
    startMs >= new Date(period.startsAt).getTime() - TURNAROUND_MS &&
    startMs < new Date(period.endsAt).getTime() + TURNAROUND_MS
  );
  if (containing) {
    return {
      available: false,
      availableUntil: null,
      nextAvailableAt: new Date(new Date(containing.endsAt).getTime() + TURNAROUND_MS),
      availableMilliseconds: 0,
      availableCalendarDays: 0,
    };
  }

  const next = periods.find((period) => new Date(period.startsAt).getTime() > startMs);
  const availableUntil = next
    ? new Date(new Date(next.startsAt).getTime() - TURNAROUND_MS)
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
    blockedFrom: period.blockedFrom,
    blockedUntil: period.blockedUntil,
    turnaroundMinutes: TURNAROUND_MINUTES,
  };
}
