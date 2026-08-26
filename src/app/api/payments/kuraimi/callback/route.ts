import { eq, or } from 'drizzle-orm';
import { getDb } from '@/db';
import { platformPayments } from '@/db/schema';
import { fail, ok } from '@/lib/http';

export async function POST(request:Request){try{
  const expected=process.env.KURAIMI_WEBHOOK_SECRET;
  if(!expected||request.headers.get('x-kuraimi-webhook-secret')!==expected)return ok({error:'Invalid callback signature.'},401);
  const body=await request.json();const reference=String(body.reference||body.merchantReference||body.merchant_reference||'');
  const providerReference=String(body.transactionId||body.transaction_id||body.providerReference||body.provider_reference||reference);
  const normalized=String(body.status||'').toLowerCase();
  const status=['paid','success','successful','completed'].includes(normalized)?'paid':['failed','declined'].includes(normalized)?'failed':'pending';
  const db=await getDb();const[saved]=await db.update(platformPayments).set({
    status:status as any,providerReference:providerReference||null,responseData:body,
    paidAt:status==='paid'?new Date():null,updatedAt:new Date(),
  }).where(or(eq(platformPayments.internalReference,reference),eq(platformPayments.providerReference,reference))).returning();
  if(!saved)return ok({error:'Payment not found.'},404);return ok({received:true});
}catch(error){return fail(error)}}
