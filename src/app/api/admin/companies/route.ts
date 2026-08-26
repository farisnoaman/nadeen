import { asc, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { companies, notifications, subscriptionPlans, users } from '@/db/schema';
import { requireUser } from '@/lib/auth';
import { fail, ok } from '@/lib/http';
import { companyEntitlement } from '@/lib/platform';

export async function GET(){try{
  await requireUser('platform_admin');const db=await getDb();
  const rows=await db.select({company:companies,plan:subscriptionPlans}).from(companies)
    .leftJoin(subscriptionPlans,eq(companies.subscriptionPlanId,subscriptionPlans.id))
    .where(eq(companies.verificationStatus,'verified')).orderBy(asc(companies.name));
  const result=[];
  for(const row of rows){
    const[owner]=await db.select({name:users.name,email:users.email,phone:users.phone}).from(users)
      .where(eq(users.companyId,row.company.id)).limit(1);
    const entitlement=await companyEntitlement(db,row.company.id);
    result.push({...row.company,plan:row.plan,owner:owner||null,usage:entitlement.usage,effectiveLimits:entitlement.effectiveLimits});
  }
  const plans=await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.active,true)).orderBy(asc(subscriptionPlans.monthlyPriceUsd));
  return ok({companies:result,plans,stats:{
    active:result.filter(x=>x.operationalStatus==='active').length,
    paused:result.filter(x=>x.operationalStatus==='paused').length,
    deactivated:result.filter(x=>x.operationalStatus==='deactivated').length,
  }});
}catch(error){return fail(error)}}

const override=(value:any,label:string)=>{
  if(value===null||value===undefined||value==='')return null;
  const number=Number(value);if(!Number.isInteger(number)||number<1||number>10_000_000)throw new Error(`${label} must be a positive whole number or left blank to inherit the package limit.`);return number;
};
export async function PATCH(request:Request){try{
  await requireUser('platform_admin');const body=await request.json();const db=await getDb();
  const[company]=await db.select().from(companies).where(eq(companies.id,Number(body.id))).limit(1);
  if(!company||company.verificationStatus!=='verified')throw new Error('Verified company not found.');
  const operationalStatus=String(body.operationalStatus||company.operationalStatus);
  if(!['active','paused','deactivated'].includes(operationalStatus))throw new Error('Choose active, paused, or deactivated.');
  const planId=Number(body.subscriptionPlanId||company.subscriptionPlanId);
  const[plan]=await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id,planId)).limit(1);
  if(!plan||!plan.active)throw new Error('Choose an active subscription package.');
  if(operationalStatus==='active'&&company.subscriptionStatus!=='active')throw new Error('The subscription must be active before the company can be activated.');
  const[saved]=await db.update(companies).set({
    operationalStatus:operationalStatus as any,subscriptionPlanId:plan.id,
    maxVehiclesOverride:override(body.maxVehiclesOverride,'Vehicle limit'),
    maxRentalRequestsOverride:override(body.maxRentalRequestsOverride,'Rental-request limit'),
    storageGbOverride:override(body.storageGbOverride,'Storage limit'),
  }).where(eq(companies.id,company.id)).returning();
  await db.insert(notifications).values({
    companyId:company.id,type:'system',body:`Company status · ${operationalStatus}`,
    href:'/dashboard',entityType:'company_status',entityId:company.id,
    dedupeKey:`company-status-${company.id}-${operationalStatus}-${Date.now()}`,
  });
  const entitlement=await companyEntitlement(db,company.id);
  return ok({company:{...saved,plan,usage:entitlement.usage,effectiveLimits:entitlement.effectiveLimits}});
}catch(error){return fail(error)}}
