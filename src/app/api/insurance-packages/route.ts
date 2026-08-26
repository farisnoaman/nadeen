import { desc, eq, inArray } from 'drizzle-orm';
import { getDb } from '@/db';
import { insurancePackages, insurancePackageVehicles, vehicles } from '@/db/schema';
import { requireUser } from '@/lib/auth';
import { fail, ok } from '@/lib/http';
import { protectionCoverage, PROTECTION_TIERS, type ProtectionTier } from '@/lib/insurance';

async function companyVehicleIds(db: any, companyId: number, requested: unknown) {
  const ids = [...new Set((Array.isArray(requested) ? requested : []).map(Number).filter(Number.isInteger))] as number[];
  if (!ids.length) return [];
  const companyRows = await db.select({ id: vehicles.id }).from(vehicles)
    .where(eq(vehicles.companyId, companyId));
  const companySet = new Set(companyRows.map((row: any) => row.id));
  if (ids.some(id => !companySet.has(id))) throw new Error('One or more selected vehicles do not belong to your company.');
  return ids;
}

export async function GET() {
  try {
    const user = await requireUser('company');
    const db = await getDb();
    const rows = await db.select().from(insurancePackages)
      .where(eq(insurancePackages.companyId, user.companyId!)).orderBy(desc(insurancePackages.createdAt));
    const ids = rows.map((row: any) => row.id);
    const links = ids.length
      ? await db.select().from(insurancePackageVehicles).where(inArray(insurancePackageVehicles.packageId, ids))
      : [];
    return ok({ packages: rows.map((row: any) => ({
      ...row,
      vehicleIds: links.filter((link: any) => link.packageId === row.id).map((link: any) => link.vehicleId),
    })) });
  } catch (error) { return fail(error); }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser('company');
    const body = await request.json();
    const name = String(body.name || '').trim();
    const tier = String(body.tier || '') as ProtectionTier;
    const appliesTo = body.appliesTo === 'selected' ? 'selected' : 'all';
    const dailyPrice = Number(body.dailyPrice);
    const deductible = Number(body.deductible);
    if (!name || !PROTECTION_TIERS.includes(tier)) throw new Error('Complete the insurance package name and tier.');
    if (!Number.isFinite(dailyPrice) || dailyPrice < 0 || !Number.isFinite(deductible) || deductible < 0) {
      throw new Error('Package price and deductible must be valid non-negative amounts.');
    }
    const db = await getDb();
    const vehicleIds = await companyVehicleIds(db, user.companyId!, body.vehicleIds);
    if (appliesTo === 'selected' && !vehicleIds.length) throw new Error('Choose at least one vehicle for this package.');
    const saved = await db.transaction(async (tx: any) => {
      const [row] = await tx.insert(insurancePackages).values({
        companyId: user.companyId!, name, tier, description: String(body.description || '').trim().slice(0, 500),
        dailyPrice, deductible, coverage: protectionCoverage(tier, body.coverage), appliesTo,
        active: body.active !== false,
      }).returning();
      if (appliesTo === 'selected') {
        await tx.insert(insurancePackageVehicles).values(vehicleIds.map(vehicleId => ({ packageId: row.id, vehicleId })));
      }
      return row;
    });
    return ok({ package: { ...saved, vehicleIds: appliesTo === 'selected' ? vehicleIds : [] } }, 201);
  } catch (error) { return fail(error); }
}
