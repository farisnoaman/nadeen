import { and, desc, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { vehicleConditionLogs, vehicles } from '@/db/schema';
import { requireUser } from '@/lib/auth';
import { fail, ok } from '@/lib/http';
import { canonicalOdometer, fuelEfficiencyAnalytics } from '@/lib/telemetry';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser('company');
    const { id } = await params;
    const db = await getDb();
    const [vehicle] = await db.select().from(vehicles).where(and(
      eq(vehicles.id, Number(id)), eq(vehicles.companyId, user.companyId!),
    )).limit(1);
    if (!vehicle) return ok({ error: 'Vehicle not found' }, 404);
    const logs = await db.select().from(vehicleConditionLogs)
      .where(eq(vehicleConditionLogs.vehicleId, vehicle.id)).orderBy(desc(vehicleConditionLogs.createdAt)).limit(200);
    const currentVehicle = { ...vehicle, odometer: canonicalOdometer(vehicle.odometer, logs) };
    return ok({ vehicle: currentVehicle, logs, fuelAnalytics: fuelEfficiencyAnalytics(currentVehicle, logs) });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser('company');
    const { id } = await params;
    const body = await request.json();
    const db = await getDb();
    const [vehicle] = await db.select().from(vehicles).where(and(
      eq(vehicles.id, Number(id)), eq(vehicles.companyId, user.companyId!),
    )).limit(1);
    if (!vehicle) return ok({ error: 'Vehicle not found' }, 404);
    const priorLogs = await db.select().from(vehicleConditionLogs)
      .where(eq(vehicleConditionLogs.vehicleId, vehicle.id));
    const lastRecordedOdometer = canonicalOdometer(vehicle.odometer, priorLogs);
    const odometer = Math.round(Number(body.odometer));
    const fuelLevel = Math.round(Number(body.fuelLevel));
    if (!Number.isFinite(odometer) || odometer < lastRecordedOdometer) throw new Error('Odometer readings cannot move backwards.');
    if (!Number.isFinite(fuelLevel) || fuelLevel < 0 || fuelLevel > 100) throw new Error('Fuel level must be between 0 and 100.');
    const eventType = body.eventType === 'refuel' ? 'refuel' : 'manual';
    const litersInput = body.fuelAddedLiters === '' || body.fuelAddedLiters == null ? null : Number(body.fuelAddedLiters);
    const costInput = body.fuelCost === '' || body.fuelCost == null ? null : Number(body.fuelCost);
    if (litersInput != null && (!Number.isFinite(litersInput) || litersInput < 0)) throw new Error('Enter a valid fuel quantity.');
    if (costInput != null && (!Number.isFinite(costInput) || costInput < 0)) throw new Error('Enter a valid fuel cost.');
    if (eventType === 'refuel' && (!litersInput || !costInput)) throw new Error('Refueling records require the liters added and total fuel cost.');
    const fuelAddedLiters = litersInput;
    const fuelCost = costInput;
    const saved = await db.transaction(async (tx:any) => {
      const [updated] = await tx.update(vehicles).set({ odometer, fuelLevel })
        .where(and(eq(vehicles.id, vehicle.id), eq(vehicles.odometer, vehicle.odometer))).returning();
      if (!updated) throw new Error('The vehicle reading was updated elsewhere. Refresh and try again.');
      const [log] = await tx.insert(vehicleConditionLogs).values({
        companyId: user.companyId!, vehicleId: vehicle.id, recordedBy: user.id, eventType,
        odometer, fuelLevel, fuelAddedLiters, fuelCost, notes: String(body.notes || '').slice(0, 500) || null,
      }).returning();
      return { updated, log };
    });
    const logs = [saved.log, ...priorLogs];
    return ok({
      vehicle: saved.updated,
      log: saved.log,
      fuelAnalytics: fuelEfficiencyAnalytics(saved.updated, logs),
    }, 201);
  } catch (error) {
    return fail(error);
  }
}
