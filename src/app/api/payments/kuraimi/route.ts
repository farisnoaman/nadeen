import { randomUUID } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { paymentGatewaySettings, platformPayments, subscriptionPlans } from '@/db/schema';
import { requireUser } from '@/lib/auth';
import { fail, ok } from '@/lib/http';
import { createKuraimiCheckout } from '@/lib/kuraimi-payment';

export async function GET(){try{
  const user=await requireUser(undefined,{allowUnverifiedCompany:true});if(user.role!=='company'||!user.companyId)throw new Error('Company administrator access required.');const db=await getDb();
  return ok({payments:await db.select().from(platformPayments).where(eq(platformPayments.companyId,user.companyId!)).orderBy(desc(platformPayments.createdAt))});
}catch(error){return fail(error)}}

export async function POST(request:Request){try{
  const user=await requireUser(undefined,{allowUnverifiedCompany:true});if(user.role!=='company'||!user.companyId)throw new Error('Company administrator access required.');const body=await request.json();const db=await getDb();
  const[plan]=await db.select().from(subscriptionPlans).where(and(eq(subscriptionPlans.code,String(body.planCode||'').toUpperCase()),eq(subscriptionPlans.active,true))).limit(1);
  if(!plan)throw new Error('Choose an active subscription package.');
  const[gateway]=await db.select().from(paymentGatewaySettings).where(eq(paymentGatewaySettings.provider,'kuraimi')).limit(1);
  if(!gateway)throw new Error('Kuraimi payment settings are unavailable.');
  const idempotencyKey=String(body.idempotencyKey||randomUUID()).slice(0,100);
  const[previous]=await db.select().from(platformPayments).where(eq(platformPayments.idempotencyKey,idempotencyKey)).limit(1);
  if(previous){if(previous.companyId!==user.companyId)throw new Error('Invalid payment key.');return ok({payment:previous})}
  const internalReference=`FF-SUB-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0,6).toUpperCase()}`;
  const[payment]=await db.insert(platformPayments).values({
    companyId:user.companyId!,subscriptionPlanId:plan.id,amount:plan.monthlyPriceUsd,currency:'USD',
    status:'created',internalReference,idempotencyKey,
  }).returning();
  try{
    const origin=new URL(request.url).origin;
    const result=await createKuraimiCheckout(gateway,{
      reference:internalReference,amount:plan.monthlyPriceUsd,currency:'USD',
      description:`FleetFlow ${plan.name} monthly subscription`,callbackUrl:`${origin}/api/payments/kuraimi/callback`,
    });
    const[saved]=await db.update(platformPayments).set({providerReference:result.providerReference,checkoutUrl:result.checkoutUrl||null,status:result.status as any,responseData:result.data,updatedAt:new Date()})
      .where(eq(platformPayments.id,payment.id)).returning();
    return ok({payment:saved},201);
  }catch(error){await db.update(platformPayments).set({status:'failed',updatedAt:new Date()}).where(eq(platformPayments.id,payment.id));throw error}
}catch(error){return fail(error)}}
