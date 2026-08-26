import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { companies, vehicles } from '@/db/schema';
import { getSession } from '@/lib/auth';
import { availabilitySuggestion, getBusyPeriods, serializeBusyPeriod, TURNAROUND_MINUTES } from '@/lib/availability';
import { fail, ok } from '@/lib/http';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSession();
    const { id } = await params;
    const vehicleId = Number(id);
    const db = await getDb();
    const [vehicle] = await db.select({ id: vehicles.id, status: vehicles.status, companyId:vehicles.companyId, companyVerificationStatus:companies.verificationStatus, companySubscriptionStatus:companies.subscriptionStatus, companyOperationalStatus:companies.operationalStatus })
      .from(vehicles).innerJoin(companies,eq(vehicles.companyId,companies.id)).where(eq(vehicles.id, vehicleId)).limit(1);
    if (!vehicle
      || (user?.role === 'company' && vehicle.companyId !== user.companyId)
      || (user?.role !== 'company' && (vehicle.status !== 'available' || vehicle.companyVerificationStatus !== 'verified' || vehicle.companySubscriptionStatus !== 'active' || vehicle.companyOperationalStatus !== 'active'))) return ok({ error: 'Vehicle not found' }, 404);

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
