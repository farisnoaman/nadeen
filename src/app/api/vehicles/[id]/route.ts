import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { getDb } from '@/db';
import { companies, insurancePackages, insurancePackageVehicles, promotionVehicles, promotions, rentals, users, vehicleConditionLogs, vehicles } from '@/db/schema';
import { getSession, requireUser } from '@/lib/auth';
import { getBusyPeriods, serializeBusyPeriod, TURNAROUND_MINUTES } from '@/lib/availability';
import { fail, ok } from '@/lib/http';
import { normalizeProtectionPackages } from '@/lib/insurance';
import { normalizePickupLocations } from '@/lib/locations';
import { loyaltyStatus } from '@/lib/loyalty';
import { effectiveKilometerPolicy } from '@/lib/kilometer-policy';
import { promotionState } from '@/lib/pricing';
import { toPublicPromotion, toPublicVehicle } from '@/lib/public-vehicle';
import { requireVerifiedCompany } from '@/lib/platform';
import { canonicalOdometer, fuelEfficiencyAnalytics } from '@/lib/telemetry';
import { normalizeVehicleImages } from '@/lib/vehicle-images';

const boundedFuel = (value: unknown) => Math.min(100, Math.max(0, Math.round(Number(value))));

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSession();
    const { id } = await params;
    const db = await getDb();
    const [selected] = await db.select({ vehicle: vehicles, companyName: companies.name, companyCurrency: { baseCurrency: companies.baseCurrency, supportedCurrencies: companies.supportedCurrencies, exchangeRates: companies.exchangeRates }, companyVerificationStatus:companies.verificationStatus, companySubscriptionStatus:companies.subscriptionStatus, companyOperationalStatus:companies.operationalStatus, whatsappNumbers:companies.whatsappNumbers }).from(vehicles)
      .innerJoin(companies, eq(vehicles.companyId, companies.id))
      .where(eq(vehicles.id, Number(id))).limit(1);
    if (!selected
      || (user?.role === 'company' && selected.vehicle.companyId !== user.companyId)
      || (user?.role !== 'company' && (selected.vehicle.status !== 'available' || selected.companyVerificationStatus !== 'verified' || selected.companySubscriptionStatus !== 'active' || selected.companyOperationalStatus !== 'active'))) {
      return ok({ error: 'Vehicle not found' }, 404);
    }
    const packageRows = await db.select().from(insurancePackages)
      .where(eq(insurancePackages.companyId, selected.vehicle.companyId));
    const packageLinks = await db.select().from(insurancePackageVehicles)
      .where(eq(insurancePackageVehicles.vehicleId, selected.vehicle.id));
    const applicablePackages = packageRows.filter((pkg: any) =>
      (user?.role === 'company' || pkg.active)
      && (pkg.appliesTo === 'all' || packageLinks.some((link: any) => link.packageId === pkg.id))
    );
    const row = {
      ...selected.vehicle,
      companyName: selected.companyName,
      companyCurrency: selected.companyCurrency,
      whatsappNumbers: selected.whatsappNumbers || [],
      pickupLocations: normalizePickupLocations(selected.vehicle.pickupLocations, selected.vehicle.location),
      protectionPackages: packageRows.length
        ? (applicablePackages.length ? applicablePackages : normalizeProtectionPackages([], selected.vehicle.insuranceDeductible).slice(0, 1))
        : normalizeProtectionPackages(selected.vehicle.protectionPackages, selected.vehicle.insuranceDeductible),
    };
    const companyAccess = user?.role === 'company' && row.companyId === user.companyId;
    const allConditionLogs = await db.select().from(vehicleConditionLogs)
      .where(eq(vehicleConditionLogs.vehicleId, row.id)).orderBy(desc(vehicleConditionLogs.createdAt)).limit(200);
    row.odometer = canonicalOdometer(row.odometer, allConditionLogs);
    const history = companyAccess ? await db.select({
      id: rentals.id, status: rentals.status, rateType: rentals.rateType, quantity: rentals.quantity,
      startsAt: rentals.startsAt, endsAt: rentals.endsAt, subtotal: rentals.subtotal,
      discount: rentals.discount, total: rentals.total, promoCode: rentals.promoCode,
      protectionTier: rentals.protectionTier, protectionName: rentals.protectionName, pickupOdometer: rentals.pickupOdometer,
      returnOdometer: rentals.returnOdometer, pickupFuelLevel: rentals.pickupFuelLevel,
      returnFuelLevel: rentals.returnFuelLevel, createdAt: rentals.createdAt,
      customer: users.name, customerEmail: users.email, avatar: users.avatar,
    }).from(rentals).innerJoin(users, eq(rentals.renterId, users.id))
      .where(eq(rentals.vehicleId, row.id)).orderBy(desc(rentals.startsAt)) : [];
    const conditionLogs = companyAccess ? allConditionLogs.slice(0, 60) : [];
    const promoRows = await db.select().from(promotions).where(and(eq(promotions.companyId, row.companyId), isNull(promotions.archivedAt)));
    const links = await db.select().from(promotionVehicles).where(eq(promotionVehicles.vehicleId, row.id));
    const eligible = promoRows.filter((promo: any) => promotionState(promo) === 'live'
      && (promo.appliesTo === 'all' || links.some((link: any) => link.promotionId === promo.id)))
      .map((promo: any) => {
        const promotion = { ...promo, state: promotionState(promo) };
        return user ? promotion : toPublicPromotion(promotion);
      });
    const busyPeriods = await getBusyPeriods(db, row.id);
    const loyalty = user?.role === 'renter' ? await loyaltyStatus(db, row.companyId, user.id) : null;
    return ok({
      vehicle: user ? row : toPublicVehicle(row), history, conditionLogs, userRole: user?.role || 'guest', promotions: eligible, loyalty,
      fuelAnalytics: companyAccess ? fuelEfficiencyAnalytics(row, allConditionLogs) : null,
      busyPeriods: busyPeriods.map(serializeBusyPeriod), turnaroundMinutes: TURNAROUND_MINUTES,
      analytics: {
        trips: history.filter((r: any) => r.status === 'completed').length,
        revenue: history.filter((r: any) => r.status !== 'cancelled').reduce((sum: number, r: any) => sum + r.total, 0),
        active: history.filter((r: any) => ['pending', 'active'].includes(r.status)).length,
      },
    });
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser('company');
    const { id } = await params;
    const db = await getDb();
    await requireVerifiedCompany(db,user);
    const [existing] = await db.select().from(vehicles)
      .where(and(eq(vehicles.id, Number(id)), eq(vehicles.companyId, user.companyId!))).limit(1);
    if (!existing) return ok({ error: 'Vehicle not found' }, 404);
    const body = await request.json();
    const data: any = {};
    for (const key of ['make', 'model', 'trim', 'category', 'bodyType', 'gearbox', 'drivetrain', 'steeringType', 'fuel', 'color', 'licensePlate', 'vin', 'image', 'status', 'fuelPolicy', 'insuranceCoverage', 'insuranceProvider', 'insurancePolicyNumber']) {
      if (body[key] !== undefined) data[key] = ['licensePlate', 'vin'].includes(key) ? String(body[key]).trim().toUpperCase() : body[key];
    }
    if (body.images !== undefined) data.images = normalizeVehicleImages(body.images);
    if (body.pickupLocations !== undefined || body.location !== undefined) {
      const pickupLocations = normalizePickupLocations(body.pickupLocations, body.location || existing.location);
      if (!pickupLocations.length) throw new Error('Add at least one pickup city and site for this vehicle.');
      data.pickupLocations = pickupLocations;
      data.location = pickupLocations[0].site;
    }
    for (const key of ['year', 'seats', 'hourlyRate', 'dailyRate', 'weeklyRate', 'monthlyRate', 'dailyKilometerAllowance', 'excessKilometerRate', 'insuranceDeductible']) {
      if (body[key] !== undefined) data[key] = Math.max(0, Number(body[key]) || 0);
    }
    const mileagePolicy = await effectiveKilometerPolicy(db, user.companyId!, existing.id);
    if (mileagePolicy) {
      data.dailyKilometerAllowance = mileagePolicy.dailyKilometerAllowance;
      data.excessKilometerRate = mileagePolicy.excessKilometerRate;
    }
    if (body.odometer !== undefined) {
      const odometer = Math.round(Number(body.odometer));
      if (!Number.isFinite(odometer) || odometer < existing.odometer) throw new Error('Odometer readings cannot move backwards.');
      data.odometer = odometer;
    }
    if (body.fuelLevel !== undefined) {
      const fuel = boundedFuel(body.fuelLevel);
      if (!Number.isFinite(fuel)) throw new Error('Fuel level must be between 0 and 100.');
      data.fuelLevel = fuel;
    }
    if (body.fuelConsumption !== undefined) {
      const consumption = Number(body.fuelConsumption);
      data.fuelConsumption = body.fuelConsumption === null || body.fuelConsumption === '' || !Number.isFinite(consumption) || consumption < 0
        ? null
        : consumption;
    }
    if (body.fuelPolicy !== undefined && !['same_to_same', 'full_to_full', 'prepaid'].includes(body.fuelPolicy)) throw new Error('Choose a valid fuel policy.');
    if (body.insuranceCoverage !== undefined && !['third_party', 'comprehensive'].includes(body.insuranceCoverage)) throw new Error('Choose a valid insurance coverage type.');
    if (body.insurancePolicyNumber !== undefined && !String(body.insurancePolicyNumber).trim()) {
      throw new Error('Enter the vehicle insurance policy number.');
    }
    if (body.insurancePolicyExpiry !== undefined) {
      if (!body.insurancePolicyExpiry) throw new Error('Choose the vehicle insurance policy expiry date.');
      const expiry = new Date(body.insurancePolicyExpiry);
      if (Number.isNaN(expiry.getTime()) || expiry.getTime() <= Date.now()) throw new Error('Choose a future insurance policy expiry date.');
      data.insurancePolicyExpiry = expiry;
    }
    if (body.protectionPackages !== undefined || body.insuranceDeductible !== undefined) {
      data.protectionPackages = normalizeProtectionPackages(body.protectionPackages ?? existing.protectionPackages, data.insuranceDeductible ?? existing.insuranceDeductible);
    }
    if (body.features !== undefined) data.features = body.features;
    const readingChanged = (data.odometer !== undefined && data.odometer !== existing.odometer)
      || (data.fuelLevel !== undefined && data.fuelLevel !== existing.fuelLevel);
    const updated = await db.transaction(async (tx:any) => {
      const readingGuard = readingChanged
        ? and(eq(vehicles.id, existing.id), eq(vehicles.odometer, existing.odometer), eq(vehicles.fuelLevel, existing.fuelLevel))
        : eq(vehicles.id, existing.id);
      const [savedVehicle] = await tx.update(vehicles).set(data).where(readingGuard).returning();
      if (!savedVehicle) throw new Error('The vehicle reading was updated elsewhere. Refresh and try again.');
      if (readingChanged) {
        await tx.insert(vehicleConditionLogs).values({
          companyId: user.companyId!, vehicleId: existing.id, recordedBy: user.id, eventType: 'manual',
          odometer: savedVehicle.odometer, fuelLevel: savedVehicle.fuelLevel, notes: 'Reading updated from vehicle profile',
        });
      }
      return savedVehicle;
    });
    return ok({ vehicle: { ...updated, protectionPackages: normalizeProtectionPackages(updated.protectionPackages, updated.insuranceDeductible) } });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser('company');
    const { id } = await params;
    const db = await getDb();
    await requireVerifiedCompany(db,user);
    const [vehicle] = await db.select().from(vehicles)
      .where(and(eq(vehicles.id, Number(id)), eq(vehicles.companyId, user.companyId!))).limit(1);
    if (!vehicle) return ok({ error: 'Vehicle not found' }, 404);
    const current = await db.select({ id: rentals.id }).from(rentals)
      .where(and(eq(rentals.vehicleId, vehicle.id), inArray(rentals.status, ['pending', 'active']))).limit(1);
    if (current.length) throw new Error('Vehicle is booked and cannot be deleted.');
    const anyHistory = await db.select({ id: rentals.id }).from(rentals).where(eq(rentals.vehicleId, vehicle.id)).limit(1);
    if (anyHistory.length) throw new Error('Vehicle history is preserved. Mark it retired instead.');
    await db.delete(vehicles).where(eq(vehicles.id, vehicle.id));
    return ok({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
