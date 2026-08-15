import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { vehicles } from '@/db/schema';
import { requireUser } from '@/lib/auth';
import { availabilitySuggestion, getBusyPeriods, serializeBusyPeriod, TURNAROUND_MINUTES } from '@/lib/availability';
import { fail, ok } from '@/lib/http';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireUser();
    const { id } = await params;
    const vehicleId = Number(id);
    const db = await getDb();
    const [vehicle] = await db.select({ id: vehicles.id, status: vehicles.status })
      .from(vehicles).where(eq(vehicles.id, vehicleId)).limit(1);
    if (!vehicle) return ok({ error: 'Vehicle not found' }, 404);

    const periods = await getBusyPeriods(db, vehicleId);
    const url = new URL(request.url);
    const fromValue = url.searchParams.get('from');
    const from = fromValue ? new Date(fromValue) : new Date();
    const suggestion = Number.isNaN(from.getTime()) ? null : availabilitySuggestion(periods, from);

    return ok({
      vehicleStatus: vehicle.status,
      turnaroundMinutes: TURNAROUND_MINUTES,
      busyPeriods: periods.map(serializeBusyPeriod),
      suggestion,
    });
  } catch (error) {
    return fail(error);
  }
}
