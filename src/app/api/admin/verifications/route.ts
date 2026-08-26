import { and, desc, eq, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { companies, companyVerificationRequests, notifications, subscriptionPlans, users } from '@/db/schema';
import { requireUser } from '@/lib/auth';
import { fail, ok } from '@/lib/http';

export async function GET(){try{
  await requireUser('platform_admin');const db=await getDb();
  const requests=await db.select({
    id:companyVerificationRequests.id,companyId:companyVerificationRequests.companyId,companyName:companies.name,
    companyCity:companies.city,attempt:companyVerificationRequests.attempt,status:companyVerificationRequests.status,
    subscriptionPaymentCode:companyVerificationRequests.subscriptionPaymentCode,reviewNotes:companyVerificationRequests.reviewNotes,
    reviewedAt:companyVerificationRequests.reviewedAt,createdAt:companyVerificationRequests.createdAt,
    submitterName:users.name,submitterEmail:users.email,
    planId:subscriptionPlans.id,planCode:subscriptionPlans.code,planName:subscriptionPlans.name,
    monthlyPriceUsd:subscriptionPlans.monthlyPriceUsd,maxVehicles:subscriptionPlans.maxVehicles,
    maxRentalRequests:subscriptionPlans.maxRentalRequests,storageGb:subscriptionPlans.storageGb,
    businessRegistrationName:companyVerificationRequests.businessRegistrationName,
    taxCertificateName:companyVerificationRequests.taxCertificateName,ownerIdentityName:companyVerificationRequests.ownerIdentityName,
  }).from(companyVerificationRequests)
    .innerJoin(companies,eq(companyVerificationRequests.companyId,companies.id))
    .innerJoin(users,eq(companyVerificationRequests.submittedBy,users.id))
    .innerJoin(subscriptionPlans,eq(companyVerificationRequests.subscriptionPlanId,subscriptionPlans.id))
    .orderBy(desc(companyVerificationRequests.createdAt));
  const [companyCount,pendingCount,verifiedCount]=await Promise.all([
    db.select({count:sql<number>`count(*)`}).from(companies),
    db.select({count:sql<number>`count(*)`}).from(companyVerificationRequests).where(eq(companyVerificationRequests.status,'pending')),
    db.select({count:sql<number>`count(*)`}).from(companies).where(eq(companies.verificationStatus,'verified')),
  ]);
  return ok({requests,stats:{companies:Number(companyCount[0].count),pending:Number(pendingCount[0].count),verified:Number(verifiedCount[0].count)}});
}catch(error){return fail(error)}}

export async function PATCH(request:Request){try{
  const admin=await requireUser('platform_admin');const body=await request.json();const db=await getDb();
  const action=String(body.action);if(!['approve','reject'].includes(action))throw new Error('Choose approve or reject.');
  const notes=String(body.reviewNotes||'').trim();
  if(action==='reject'&&notes.length<5)throw new Error('Give the company a clear rejection reason.');
  const [existing]=await db.select().from(companyVerificationRequests).where(eq(companyVerificationRequests.id,Number(body.id))).limit(1);
  if(!existing||existing.status!=='pending')throw new Error('This verification request is no longer pending.');
  const status=action==='approve'?'approved':'rejected';
  const result=await db.transaction(async(tx:any)=>{
    const [saved]=await tx.update(companyVerificationRequests).set({
      status,reviewNotes:notes||'Approved by platform administrator.',reviewedBy:admin.id,reviewedAt:new Date(),updatedAt:new Date(),
    }).where(and(eq(companyVerificationRequests.id,existing.id),eq(companyVerificationRequests.status,'pending'))).returning();
    if(!saved)throw new Error('This verification request was already reviewed.');
    await tx.update(companies).set(action==='approve'?{
      verificationStatus:'verified',verifiedAt:new Date(),subscriptionPlanId:existing.subscriptionPlanId,
      subscriptionStatus:'active',subscriptionStartedAt:new Date(),operationalStatus:'active',
    }:{verificationStatus:'rejected',subscriptionStatus:'inactive',operationalStatus:'paused'})
      .where(eq(companies.id,existing.companyId));
    await tx.insert(notifications).values({
      companyId:existing.companyId,type:'system',
      body:action==='approve'?'Company verification approved':'Company verification rejected',
      href:'/dashboard/verification',entityType:'company_verification',entityId:existing.id,
      dedupeKey:`company-verification-review-${existing.id}`,
    }).onConflictDoNothing();
    return saved;
  });
  return ok({request:{id:result.id,status:result.status,reviewNotes:result.reviewNotes}});
}catch(error){return fail(error)}}
