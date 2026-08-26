import { and, eq, inArray } from 'drizzle-orm';
import { kilometerPolicies, kilometerPolicyVehicles, vehicles } from '@/db/schema';

export function kilometerPolicyValues(body: any, fallback?: any) {
  const name = String(body.name ?? fallback?.name ?? '').trim();
  const dailyKilometerAllowance = Math.round(Number(body.dailyKilometerAllowance ?? fallback?.dailyKilometerAllowance));
  const excessKilometerRate = Number(body.excessKilometerRate ?? fallback?.excessKilometerRate);
  const appliesTo = body.appliesTo === undefined
    ? (fallback?.appliesTo || 'all')
    : body.appliesTo === 'selected' ? 'selected' : 'all';
  if (!name) throw new Error('Enter a policy name.');
  if (!Number.isFinite(dailyKilometerAllowance) || dailyKilometerAllowance < 0) {
    throw new Error('Daily kilometer allowance must be a valid non-negative whole number.');
  }
  if (!Number.isFinite(excessKilometerRate) || excessKilometerRate < 0) {
    throw new Error('Excess kilometer fee must be a valid non-negative amount.');
  }
  return {
    name:name.slice(0, 120),
    description:String(body.description ?? fallback?.description ?? '').trim().slice(0, 500),
    dailyKilometerAllowance,
    excessKilometerRate:Math.round(excessKilometerRate * 100) / 100,
    appliesTo,
    active:body.active === undefined ? fallback?.active !== false : body.active !== false,
  } as const;
}

export async function validatePolicyVehicleIds(db:any, companyId:number, requested:unknown, excludePolicyId?:number) {
  const ids = [...new Set((Array.isArray(requested) ? requested : []).map(Number).filter(Number.isInteger))] as number[];
  const companyRows = await db.select({ id:vehicles.id }).from(vehicles).where(eq(vehicles.companyId, companyId));
  const companySet = new Set(companyRows.map((row:any) => row.id));
  if (ids.some(id => !companySet.has(id))) throw new Error('One or more selected vehicles do not belong to your company.');
  if (ids.length) {
    const links = await db.select({ vehicleId:kilometerPolicyVehicles.vehicleId, policyId:kilometerPolicyVehicles.policyId })
      .from(kilometerPolicyVehicles).where(inArray(kilometerPolicyVehicles.vehicleId, ids));
    const conflict = links.find((link:any) => link.policyId !== excludePolicyId);
    if (conflict) throw new Error('A selected vehicle is already assigned to another mileage policy. Edit that policy first.');
  }
  return ids;
}

export async function assertSingleFleetPolicy(db:any, companyId:number, appliesTo:string, excludePolicyId?:number) {
  if (appliesTo !== 'all') return;
  const rows = await db.select({ id:kilometerPolicies.id }).from(kilometerPolicies)
    .where(and(eq(kilometerPolicies.companyId, companyId), eq(kilometerPolicies.appliesTo, 'all')));
  if (rows.some((row:any) => row.id !== excludePolicyId)) {
    throw new Error('This company already has a whole-fleet mileage policy. Edit it or create a selected-vehicle policy.');
  }
}

/** Applies active selected policies first, then the active whole-fleet default to every remaining vehicle. */
export async function synchronizeKilometerPolicies(db:any, companyId:number) {
  const [policyRows, vehicleRows] = await Promise.all([
    db.select().from(kilometerPolicies).where(and(eq(kilometerPolicies.companyId, companyId), eq(kilometerPolicies.active, true))),
    db.select({ id:vehicles.id }).from(vehicles).where(eq(vehicles.companyId, companyId)),
  ]);
  const selected = policyRows.filter((policy:any) => policy.appliesTo === 'selected');
  const selectedIds = selected.map((policy:any) => policy.id);
  const links = selectedIds.length
    ? await db.select().from(kilometerPolicyVehicles).where(inArray(kilometerPolicyVehicles.policyId, selectedIds))
    : [];
  const overridden = new Set<number>();
  for (const policy of selected) {
    const ids = links.filter((link:any) => link.policyId === policy.id).map((link:any) => link.vehicleId);
    if (!ids.length) continue;
    ids.forEach((id:number) => overridden.add(id));
    await db.update(vehicles).set({
      dailyKilometerAllowance:policy.dailyKilometerAllowance,
      excessKilometerRate:policy.excessKilometerRate,
    }).where(and(eq(vehicles.companyId, companyId), inArray(vehicles.id, ids)));
  }
  const fleetPolicy = policyRows.find((policy:any) => policy.appliesTo === 'all');
  const defaultIds = vehicleRows.map((row:any) => row.id).filter((id:number) => !overridden.has(id));
  if (fleetPolicy && defaultIds.length) {
    await db.update(vehicles).set({
      dailyKilometerAllowance:fleetPolicy.dailyKilometerAllowance,
      excessKilometerRate:fleetPolicy.excessKilometerRate,
    }).where(and(eq(vehicles.companyId, companyId), inArray(vehicles.id, defaultIds)));
  }
}

export async function effectiveKilometerPolicy(db:any, companyId:number, vehicleId:number) {
  const [selected] = await db.select({ policy:kilometerPolicies }).from(kilometerPolicyVehicles)
    .innerJoin(kilometerPolicies, eq(kilometerPolicyVehicles.policyId, kilometerPolicies.id))
    .where(and(
      eq(kilometerPolicyVehicles.vehicleId, vehicleId),
      eq(kilometerPolicies.companyId, companyId),
      eq(kilometerPolicies.active, true),
    )).limit(1);
  if (selected?.policy) return selected.policy;
  const [fleetPolicy] = await db.select().from(kilometerPolicies).where(and(
    eq(kilometerPolicies.companyId, companyId),
    eq(kilometerPolicies.appliesTo, 'all'),
    eq(kilometerPolicies.active, true),
  )).limit(1);
  return fleetPolicy || null;
}
