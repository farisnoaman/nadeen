import { desc, eq, inArray } from 'drizzle-orm';
import { getDb } from '@/db';
import { kilometerPolicies, kilometerPolicyVehicles } from '@/db/schema';
import { requireUser } from '@/lib/auth';
import { fail, ok } from '@/lib/http';
import { assertSingleFleetPolicy, kilometerPolicyValues, synchronizeKilometerPolicies, validatePolicyVehicleIds } from '@/lib/kilometer-policy';

export async function GET() {
  try {
    const user = await requireUser('company');
    const db = await getDb();
    const policies = await db.select().from(kilometerPolicies)
      .where(eq(kilometerPolicies.companyId, user.companyId!)).orderBy(desc(kilometerPolicies.updatedAt));
    const policyIds = policies.map((policy:any) => policy.id);
    const links = policyIds.length
      ? await db.select().from(kilometerPolicyVehicles).where(inArray(kilometerPolicyVehicles.policyId, policyIds))
      : [];
    return ok({ policies:policies.map((policy:any) => ({
      ...policy,
      vehicleIds:links.filter((link:any) => link.policyId === policy.id).map((link:any) => link.vehicleId),
    })) });
  } catch (error) { return fail(error); }
}

export async function POST(request:Request) {
  try {
    const user = await requireUser('company');
    const body = await request.json();
    const values = kilometerPolicyValues(body);
    const db = await getDb();
    await assertSingleFleetPolicy(db, user.companyId!, values.appliesTo);
    const vehicleIds = await validatePolicyVehicleIds(db, user.companyId!, body.vehicleIds);
    if (values.appliesTo === 'selected' && !vehicleIds.length) throw new Error('Choose at least one vehicle for this mileage policy.');
    const policy = await db.transaction(async (tx:any) => {
      const [created] = await tx.insert(kilometerPolicies).values({ companyId:user.companyId!, ...values }).returning();
      if (values.appliesTo === 'selected') {
        await tx.insert(kilometerPolicyVehicles).values(vehicleIds.map(vehicleId => ({ policyId:created.id, vehicleId })));
      }
      await synchronizeKilometerPolicies(tx, user.companyId!);
      return created;
    });
    return ok({ policy:{ ...policy, vehicleIds:values.appliesTo === 'selected' ? vehicleIds : [] } }, 201);
  } catch (error) { return fail(error); }
}
