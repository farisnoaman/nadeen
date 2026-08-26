import { and, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { insurancePackages, insurancePackageVehicles, vehicles } from '@/db/schema';
import { requireUser } from '@/lib/auth';
import { fail, ok } from '@/lib/http';
import { protectionCoverage, PROTECTION_TIERS, type ProtectionTier } from '@/lib/insurance';

async function validateVehicleIds(db: any, companyId: number, requested: unknown) {
  const ids = [...new Set((Array.isArray(requested) ? requested : []).map(Number).filter(Number.isInteger))] as number[];
  const companyRows = await db.select({ id: vehicles.id }).from(vehicles).where(eq(vehicles.companyId, companyId));
  const companySet = new Set(companyRows.map((row: any) => row.id));
  if (ids.some(id => !companySet.has(id))) throw new Error('One or more selected vehicles do not belong to your company.');
  return ids;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser('company');
    const { id } = await params;
    const body = await request.json();
    const db = await getDb();
    const [existing] = await db.select().from(insurancePackages).where(and(
      eq(insurancePackages.id, Number(id)), eq(insurancePackages.companyId, user.companyId!),
    )).limit(1);
    if (!existing) return ok({ error: 'Insurance package not found' }, 404);

    const tier = String(body.tier ?? existing.tier) as ProtectionTier;
    const name = String(body.name ?? existing.name).trim();
    const dailyPrice = Number(body.dailyPrice ?? existing.dailyPrice);
    const deductible = Number(body.deductible ?? existing.deductible);
    const appliesTo = body.appliesTo === undefined ? existing.appliesTo : body.appliesTo === 'selected' ? 'selected' : 'all';
    if (!name || !PROTECTION_TIERS.includes(tier)) throw new Error('Complete the insurance package name and tier.');
    if (!Number.isFinite(dailyPrice) || dailyPrice < 0 || !Number.isFinite(deductible) || deductible < 0) {
      throw new Error('Package price and deductible must be valid non-negative amounts.');
    }
    const currentLinks = await db.select().from(insurancePackageVehicles)
      .where(eq(insurancePackageVehicles.packageId, existing.id));
    const vehicleIds = body.vehicleIds === undefined
      ? currentLinks.map((link: any) => link.vehicleId)
      : await validateVehicleIds(db, user.companyId!, body.vehicleIds);
    if (appliesTo === 'selected' && !vehicleIds.length) throw new Error('Choose at least one vehicle for this package.');

    const row = await db.transaction(async (tx: any) => {
      const [updated] = await tx.update(insurancePackages).set({
        name, tier, description: String(body.description ?? existing.description).trim().slice(0, 500),
        dailyPrice, deductible, coverage: protectionCoverage(tier, body.coverage ?? existing.coverage),
        appliesTo, active: body.active === undefined ? existing.active : body.active !== false,
        updatedAt: new Date(),
      }).where(eq(insurancePackages.id, existing.id)).returning();
      await tx.delete(insurancePackageVehicles).where(eq(insurancePackageVehicles.packageId, existing.id));
      if (appliesTo === 'selected') {
        await tx.insert(insurancePackageVehicles).values(vehicleIds.map((vehicleId:number) => ({ packageId: existing.id, vehicleId })));
      }
      return updated;
    });
    return ok({ package: { ...row, vehicleIds: appliesTo === 'selected' ? vehicleIds : [] } });
  } catch (error) { return fail(error); }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser('company');
    const { id } = await params;
    const db = await getDb();
    const [deleted] = await db.delete(insurancePackages).where(and(
      eq(insurancePackages.id, Number(id)), eq(insurancePackages.companyId, user.companyId!),
    )).returning({ id: insurancePackages.id });
    if (!deleted) return ok({ error: 'Insurance package not found' }, 404);
    return ok({ ok: true });
  } catch (error) { return fail(error); }
}
