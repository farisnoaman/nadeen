import { and, eq, gte, sql } from 'drizzle-orm';
import { AuthError, SessionUser } from './auth';
import { companies, rentals, subscriptionPlans, vehicles } from '@/db/schema';

export const SUBSCRIPTION_PLAN_BLUEPRINTS = [
  { code:'STARTER', name:'Starter', monthlyPriceUsd:29, maxVehicles:10, maxRentalRequests:120, storageGb:5 },
  { code:'GROWTH', name:'Growth', monthlyPriceUsd:89, maxVehicles:50, maxRentalRequests:1000, storageGb:25 },
  { code:'SCALE', name:'Scale', monthlyPriceUsd:249, maxVehicles:250, maxRentalRequests:10000, storageGb:100 },
] as const;

export async function companyEntitlement(db:any, companyId:number) {
  const [company] = await db.select({
    id:companies.id, verificationStatus:companies.verificationStatus, operationalStatus:companies.operationalStatus,
    subscriptionStatus:companies.subscriptionStatus, subscriptionPlanId:companies.subscriptionPlanId,
    maxVehiclesOverride:companies.maxVehiclesOverride,maxRentalRequestsOverride:companies.maxRentalRequestsOverride,
    storageGbOverride:companies.storageGbOverride,plan:subscriptionPlans,
  }).from(companies).leftJoin(subscriptionPlans, eq(companies.subscriptionPlanId, subscriptionPlans.id))
    .where(eq(companies.id, companyId)).limit(1);
  if (!company) throw new AuthError('Company account not found.', 404);
  const monthStart = new Date();
  monthStart.setUTCDate(1); monthStart.setUTCHours(0,0,0,0);
  const [[vehicleUsage], [rentalUsage]] = await Promise.all([
    db.select({ count:sql<number>`count(*)` }).from(vehicles).where(eq(vehicles.companyId, companyId)),
    db.select({ count:sql<number>`count(*)` }).from(rentals).innerJoin(vehicles, eq(rentals.vehicleId, vehicles.id))
      .where(and(eq(vehicles.companyId, companyId), gte(rentals.createdAt, monthStart))),
  ]);
  return {
    ...company,
    effectiveLimits:company.plan?{
      maxVehicles:company.maxVehiclesOverride??company.plan.maxVehicles,
      maxRentalRequests:company.maxRentalRequestsOverride??company.plan.maxRentalRequests,
      storageGb:company.storageGbOverride??company.plan.storageGb,
    }:null,
    usage:{ vehicles:Number(vehicleUsage.count), rentalRequestsThisMonth:Number(rentalUsage.count), storageGb:0 },
  };
}

export async function requireVerifiedCompany(db:any, user:SessionUser) {
  if (user.role !== 'company' || !user.companyId) throw new AuthError('Company administrator access required.', 403);
  const entitlement = await companyEntitlement(db, user.companyId);
  if (entitlement.verificationStatus !== 'verified') {
    throw new AuthError('Your company must be verified by the platform administrator before using this feature.', 403);
  }
  if (entitlement.subscriptionStatus !== 'active' || !entitlement.plan) {
    throw new AuthError('An active subscription is required before using this feature.', 403);
  }
  if (entitlement.operationalStatus === 'deactivated') {
    throw new AuthError('This company has been deactivated by the platform administrator.', 403);
  }
  return entitlement;
}

export function assertVehicleCapacity(entitlement:any) {
  const limit=Number(entitlement.effectiveLimits?.maxVehicles||0);
  if (entitlement.usage.vehicles >= limit) {
    throw new AuthError(`Your company supports up to ${limit} vehicles. Ask the platform administrator to adjust the company limit or subscription.`, 403);
  }
}

export function assertBookableCompany(entitlement:any) {
  if (entitlement.verificationStatus !== 'verified' || entitlement.subscriptionStatus !== 'active' || entitlement.operationalStatus !== 'active' || !entitlement.plan) {
    throw new AuthError('This rental company is not currently active and available for bookings.', 403);
  }
}

export function assertRentalRequestCapacity(entitlement:any) {
  const limit=Number(entitlement.effectiveLimits?.maxRentalRequests||0);
  if (entitlement.usage.rentalRequestsThisMonth >= limit) {
    throw new AuthError(`This company reached its ${limit} monthly rental-request limit.`, 403);
  }
}
