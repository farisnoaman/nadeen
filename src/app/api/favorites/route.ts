import { and, desc, eq, isNull } from 'drizzle-orm';
import { getDb } from '@/db';
import { companies, promotionVehicles, promotions, savedVehicles, vehicles } from '@/db/schema';
import { requireUser } from '@/lib/auth';
import { fail, ok } from '@/lib/http';
import { normalizeProtectionPackages } from '@/lib/insurance';
import { normalizePickupLocations } from '@/lib/locations';
import { promotionState } from '@/lib/pricing';
import { toPublicPromotion } from '@/lib/public-vehicle';

export async function GET() {
  try {
    const user = await requireUser('renter');
    const db = await getDb();
    const rows = await db.select({ vehicle: vehicles, companyName: companies.name, savedAt: savedVehicles.createdAt })
      .from(savedVehicles)
      .innerJoin(vehicles, eq(savedVehicles.vehicleId, vehicles.id))
      .innerJoin(companies, eq(vehicles.companyId, companies.id))
      .where(eq(savedVehicles.userId, user.id))
      .orderBy(desc(savedVehicles.createdAt));
    const companyIds = [...new Set(rows.map((row: any) => row.vehicle.companyId))];
    const promoRows = companyIds.length ? await db.select().from(promotions).where(isNull(promotions.archivedAt)) : [];
    const links = companyIds.length ? await db.select().from(promotionVehicles) : [];
    const result = rows.map((row: any) => {
      const vehicle = row.vehicle;
      const projected = {
        ...vehicle,
        companyName: row.companyName,
        pickupLocations: normalizePickupLocations(vehicle.pickupLocations, vehicle.location),
        protectionPackages: normalizeProtectionPackages(vehicle.protectionPackages, vehicle.insuranceDeductible),
        promotions: promoRows.filter((promo: any) => promo.companyId === vehicle.companyId
          && promotionState(promo) === 'live'
          && (promo.appliesTo === 'all' || links.some((link: any) => link.promotionId === promo.id && link.vehicleId === vehicle.id)))
          .map((promo: any) => toPublicPromotion({ ...promo, state: promotionState(promo) })),
      };
      return projected;
    });
    return ok({ ids: rows.map((row: any) => row.vehicle.id), vehicles: result });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser('renter');
    const body = await request.json();
    const vehicleId = Number(body.vehicleId);
    if (!Number.isInteger(vehicleId)) throw new Error('Choose a valid vehicle.');
    const db = await getDb();
    await db.insert(savedVehicles).values({ userId: user.id, vehicleId }).onConflictDoNothing();
    return ok({ saved: true, vehicleId }, 201);
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireUser('renter');
    const body = await request.json().catch(() => ({}));
    const vehicleId = Number(body.vehicleId);
    if (!Number.isInteger(vehicleId)) throw new Error('Choose a valid vehicle.');
    const db = await getDb();
    await db.delete(savedVehicles)
      .where(and(eq(savedVehicles.userId, user.id), eq(savedVehicles.vehicleId, vehicleId)));
    return ok({ saved: false, vehicleId });
  } catch (error) {
    return fail(error);
  }
}
