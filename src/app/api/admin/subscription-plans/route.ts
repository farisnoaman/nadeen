import { asc, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { subscriptionPlans } from '@/db/schema';
import { requireUser } from '@/lib/auth';
import { fail, ok } from '@/lib/http';

export async function GET(){try{await requireUser('platform_admin');const db=await getDb();return ok({plans:await db.select().from(subscriptionPlans).orderBy(asc(subscriptionPlans.monthlyPriceUsd))})}catch(error){return fail(error)}}
export async function POST(request:Request){try{
  await requireUser('platform_admin');const body=await request.json();const db=await getDb();
  const code=String(body.code||'').trim().toUpperCase().replace(/[^A-Z0-9]+/g,'_').replace(/^_+|_+$/g,'');
  const name=String(body.name||'').trim(),description=String(body.description||'').trim();
  const monthlyPriceUsd=Number(body.monthlyPriceUsd),maxVehicles=Number(body.maxVehicles),maxRentalRequests=Number(body.maxRentalRequests),storageGb=Number(body.storageGb);
  if(code.length<2||code.length>32)throw new Error('Enter a package code between 2 and 32 characters.');
  if(name.length<2||!description)throw new Error('Enter a package name and description.');
  if(!Number.isFinite(monthlyPriceUsd)||monthlyPriceUsd<0)throw new Error('Enter a valid monthly price.');
  if(!Number.isInteger(maxVehicles)||maxVehicles<1||!Number.isInteger(maxRentalRequests)||maxRentalRequests<1||!Number.isInteger(storageGb)||storageGb<1)throw new Error('Package limits must be positive whole numbers.');
  const[existing]=await db.select({id:subscriptionPlans.id}).from(subscriptionPlans).where(eq(subscriptionPlans.code,code)).limit(1);
  if(existing)throw new Error('This subscription package code is already in use.');
  const features=Array.isArray(body.features)?body.features.map((x:any)=>String(x).trim()).filter(Boolean).slice(0,12):[];
  const[saved]=await db.insert(subscriptionPlans).values({code,name,description,monthlyPriceUsd,maxVehicles,maxRentalRequests,storageGb,features,active:body.active!==false}).returning();
  return ok({plan:saved},201);
}catch(error){return fail(error)}}
export async function PATCH(request:Request){try{
  await requireUser('platform_admin');const body=await request.json();const db=await getDb();
  const name=String(body.name||'').trim(),description=String(body.description||'').trim();
  const monthlyPriceUsd=Number(body.monthlyPriceUsd),maxVehicles=Number(body.maxVehicles),maxRentalRequests=Number(body.maxRentalRequests),storageGb=Number(body.storageGb);
  if(name.length<2||!description)throw new Error('Enter a package name and description.');
  if(!Number.isFinite(monthlyPriceUsd)||monthlyPriceUsd<0)throw new Error('Enter a valid monthly price.');
  if(!Number.isInteger(maxVehicles)||maxVehicles<1||!Number.isInteger(maxRentalRequests)||maxRentalRequests<1||!Number.isInteger(storageGb)||storageGb<1)throw new Error('Package limits must be positive whole numbers.');
  const features=Array.isArray(body.features)?body.features.map((x:any)=>String(x).trim()).filter(Boolean).slice(0,12):[];
  const[saved]=await db.update(subscriptionPlans).set({name,description,monthlyPriceUsd,maxVehicles,maxRentalRequests,storageGb,features,active:body.active===true,updatedAt:new Date()})
    .where(eq(subscriptionPlans.id,Number(body.id))).returning();
  if(!saved)throw new Error('Subscription package not found.');return ok({plan:saved});
}catch(error){return fail(error)}}
