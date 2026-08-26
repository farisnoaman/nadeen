import { desc, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { companies, platformPayments, subscriptionPlans } from '@/db/schema';
import { requireUser } from '@/lib/auth';
import { fail, ok } from '@/lib/http';

export async function GET(){try{
  await requireUser('platform_admin');const db=await getDb();
  const payments=await db.select({
    id:platformPayments.id,companyId:platformPayments.companyId,companyName:companies.name,
    planName:subscriptionPlans.name,provider:platformPayments.provider,amount:platformPayments.amount,
    currency:platformPayments.currency,status:platformPayments.status,internalReference:platformPayments.internalReference,
    providerReference:platformPayments.providerReference,checkoutUrl:platformPayments.checkoutUrl,
    paidAt:platformPayments.paidAt,createdAt:platformPayments.createdAt,
  }).from(platformPayments).innerJoin(companies,eq(platformPayments.companyId,companies.id))
    .innerJoin(subscriptionPlans,eq(platformPayments.subscriptionPlanId,subscriptionPlans.id))
    .orderBy(desc(platformPayments.createdAt)).limit(200);
  return ok({payments});
}catch(error){return fail(error)}}
