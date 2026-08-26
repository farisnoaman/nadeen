import { and, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { kilometerPolicies, kilometerPolicyVehicles } from '@/db/schema';
import { requireUser } from '@/lib/auth';
import { fail, ok } from '@/lib/http';
import { assertSingleFleetPolicy, kilometerPolicyValues, synchronizeKilometerPolicies, validatePolicyVehicleIds } from '@/lib/kilometer-policy';

export async function PATCH(request:Request, { params }:{ params:Promise<{ id:string }> }) {
  try {
    const user = await requireUser('company');
    const { id } = await params;
    const policyId = Number(id);
    const body = await request.json();
    const db = await getDb();
    const [existing] = await db.select().from(kilometerPolicies).where(and(
      eq(kilometerPolicies.id, policyId), eq(kilometerPolicies.companyId, user.companyId!),
    )).limit(1);
    if (!existing) return ok({ error:'Mileage policy not found' }, 404);
    const values = kilometerPolicyValues(body, existing);
    await assertSingleFleetPolicy(db, user.companyId!, values.appliesTo, existing.id);
    const currentLinks = await db.select().from(kilometerPolicyVehicles)
      .where(eq(kilometerPolicyVehicles.policyId, existing.id));
    const requestedIds = body.vehicleIds === undefined ? currentLinks.map((link:any) => link.vehicleId) : body.vehicleIds;
    const vehicleIds = await validatePolicyVehicleIds(db, user.companyId!, requestedIds, existing.id);
    if (values.appliesTo === 'selected' && !vehicleIds.length) throw new Error('Choose at least one vehicle for this mileage policy.');
    const policy = await db.transaction(async (tx:any) => {
      const [updated] = await tx.update(kilometerPolicies).set({ ...values, updatedAt:new Date() })
        .where(eq(kilometerPolicies.id, existing.id)).returning();
      await tx.delete(kilometerPolicyVehicles).where(eq(kilometerPolicyVehicles.policyId, existing.id));
      if (values.appliesTo === 'selected') {
        await tx.insert(kilometerPolicyVehicles).values(vehicleIds.map(vehicleId => ({ policyId:existing.id, vehicleId })));
      }
      await synchronizeKilometerPolicies(tx, user.companyId!);
      return updated;
    });
    return ok({ policy:{ ...policy, vehicleIds:values.appliesTo === 'selected' ? vehicleIds : [] } });
  } catch (error) { return fail(error); }
}

export async function DELETE(_:Request, { params }:{ params:Promise<{ id:string }> }) {
  try {
    const user = await requireUser('company');
    const { id } = await params;
    const db = await getDb();
    const deleted = await db.transaction(async (tx:any) => {
      const [row] = await tx.delete(kilometerPolicies).where(and(
        eq(kilometerPolicies.id, Number(id)), eq(kilometerPolicies.companyId, user.companyId!),
      )).returning({ id:kilometerPolicies.id });
      if (row) await synchronizeKilometerPolicies(tx, user.companyId!);
      return row;
    });
    if (!deleted) return ok({ error:'Mileage policy not found' }, 404);
    return ok({ ok:true });
  } catch (error) { return fail(error); }
}
