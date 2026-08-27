import { and, desc, eq, ilike, or } from 'drizzle-orm';
import { getDb } from '@/db';
import { companies, promotionVehicles, promotions, vehicleConditionLogs, vehicles } from '@/db/schema';
import { getSession, requireUser } from '@/lib/auth';
import { fail, ok } from '@/lib/http';
import { normalizeProtectionPackages } from '@/lib/insurance';
import { normalizePickupLocations } from '@/lib/locations';
import { effectiveKilometerPolicy } from '@/lib/kilometer-policy';
import { promotionState } from '@/lib/pricing';
import { toPublicPromotion, toPublicVehicle } from '@/lib/public-vehicle';
import { assertVehicleCapacity, requireVerifiedCompany } from '@/lib/platform';
import { normalizeVehicleImages } from '@/lib/vehicle-images';

const number = (value: unknown, minimum = 0) => Math.max(minimum, Number(value) || 0);
const fuelLevel = (value: unknown) => Math.min(100, Math.max(0, Math.round(Number(value) || 0)));

export async function GET(request: Request) {
  try {
    const user = await getSession();
    const db = await getDb();
    const url = new URL(request.url);
    const search = url.searchParams.get('search');
    const conditions: any[] = [];
    if (user?.role === 'company') conditions.push(eq(vehicles.companyId, user.companyId!));
    else conditions.push(eq(vehicles.status, 'available'),eq(companies.verificationStatus,'verified'),eq(companies.subscriptionStatus,'active'),eq(companies.operationalStatus,'active'));
    if (search) {
      const searchable:any[] = [
        ilike(vehicles.make, `%${search}%`), ilike(vehicles.model, `%${search}%`), ilike(vehicles.trim, `%${search}%`),
      ];
      if (user?.role === 'company') searchable.push(
        ilike(vehicles.licensePlate, `%${search}%`), ilike(vehicles.insurancePolicyNumber, `%${search}%`),
      );
      conditions.push(or(...searchable));
    }
    const rows = await db.select({
      vehicle: vehicles,
      companyName: companies.name,
      companyCurrency: {
        baseCurrency: companies.baseCurrency,
        supportedCurrencies: companies.supportedCurrencies,
        exchangeRates: companies.exchangeRates,
      },
    }).from(vehicles)
      .innerJoin(companies, eq(vehicles.companyId, companies.id))
      .where(and(...conditions)).orderBy(desc(vehicles.createdAt));
    const companyIds = [...new Set(rows.map((row: any) => row.vehicle.companyId))];
    const promoRows = companyIds.length ? await db.select().from(promotions) : [];
    const links = companyIds.length ? await db.select().from(promotionVehicles) : [];
    const result = rows.map((row: any) => {
      const vehicle = row.vehicle;
      const marketplaceVehicle = {
        ...vehicle,
        companyName: row.companyName,
        companyCurrency: row.companyCurrency,
        pickupLocations: normalizePickupLocations(vehicle.pickupLocations, vehicle.location),
        protectionPackages: normalizeProtectionPackages(vehicle.protectionPackages, vehicle.insuranceDeductible),
        promotions: promoRows.filter((promo: any) => promo.companyId === vehicle.companyId
          && promotionState(promo) === 'live'
          && (promo.appliesTo === 'all' || links.some((link: any) => link.promotionId === promo.id && link.vehicleId === vehicle.id)))
          .map((promo: any) => {
            const promotion = { ...promo, state: promotionState(promo) };
            return user ? promotion : toPublicPromotion(promotion);
          }),
      };
      return user ? marketplaceVehicle : toPublicVehicle(marketplaceVehicle);
    });
    return ok({ vehicles: result });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser('company');
    const body = await request.json();
    const required = ['make', 'model', 'year', 'category', 'color', 'licensePlate', 'hourlyRate', 'dailyRate', 'weeklyRate', 'monthlyRate', 'insuranceCoverage', 'insurancePolicyNumber', 'insurancePolicyExpiry'];
    for (const field of required) if (body[field] === undefined || body[field] === '') throw new Error(`Missing ${field}`);
    if (!['third_party', 'comprehensive'].includes(body.insuranceCoverage)) throw new Error('Choose a valid vehicle insurance coverage type.');
    if (!['same_to_same', 'full_to_full', 'prepaid'].includes(body.fuelPolicy)) throw new Error('Choose a valid fuel policy.');
    const policyExpiry = new Date(body.insurancePolicyExpiry);
    if (Number.isNaN(policyExpiry.getTime()) || policyExpiry.getTime() <= Date.now()) throw new Error('Choose a future insurance policy expiry date.');
    const db = await getDb();
    const entitlement = await requireVerifiedCompany(db, user);
    assertVehicleCapacity(entitlement);
    const odometer = number(body.odometer);
    const currentFuel = fuelLevel(body.fuelLevel ?? 100);
    const mileagePolicy = await effectiveKilometerPolicy(db, user.companyId!, 0);
    const protectionPackages = normalizeProtectionPackages(body.protectionPackages, body.insuranceDeductible);
    const pickupLocations = normalizePickupLocations(body.pickupLocations, body.location);
    if (!pickupLocations.length) throw new Error('Add at least one pickup city and site for this vehicle.');
    const row = await db.transaction(async (tx:any) => {
      const [savedVehicle] = await tx.insert(vehicles).values({
        companyId: user.companyId!, make: body.make, model: body.model, trim: body.trim || 'Standard',
        year: number(body.year), category: body.category, bodyType: body.bodyType || 'Sedan',
        gearbox: body.gearbox || 'Automatic', drivetrain: body.drivetrain || 'FWD',
        steeringType: body.steeringType || 'Left-hand drive', fuel: body.fuel || 'Petrol',
        seats: number(body.seats || 5, 1), color: body.color, licensePlate: String(body.licensePlate).toUpperCase(),
        vin: String(body.vin || '').trim().toUpperCase(), odometer, fuelLevel: currentFuel, fuelPolicy: body.fuelPolicy || 'same_to_same',
        dailyKilometerAllowance: mileagePolicy?.dailyKilometerAllowance ?? number(body.dailyKilometerAllowance ?? 250),
        excessKilometerRate: mileagePolicy?.excessKilometerRate ?? number(body.excessKilometerRate),
        insuranceCoverage: body.insuranceCoverage,
        insuranceProvider: String(body.insuranceProvider || ''),
        insurancePolicyNumber: String(body.insurancePolicyNumber),
        insurancePolicyExpiry: policyExpiry,
        insuranceDeductible: number(body.insuranceDeductible), protectionPackages,
        location: pickupLocations[0].site, pickupLocations,
        features: body.features || [], image: body.image || '/cars/audi.jpg', images: normalizeVehicleImages(body.images),
        status: body.status || 'available', hourlyRate: number(body.hourlyRate), dailyRate: number(body.dailyRate),
        weeklyRate: number(body.weeklyRate), monthlyRate: number(body.monthlyRate), rating: 5,
      }).returning();
      await tx.insert(vehicleConditionLogs).values({
        companyId: user.companyId!, vehicleId: savedVehicle.id, recordedBy: user.id,
        eventType: 'manual', odometer, fuelLevel: currentFuel, notes: 'Initial vehicle reading',
      });
      return savedVehicle;
    });
    return ok({ vehicle: { ...row, pickupLocations, protectionPackages } }, 201);
  } catch (error) {
    return fail(error);
  }
}
