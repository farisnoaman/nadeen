import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { paymentGatewaySettings } from '@/db/schema';
import { requireUser } from '@/lib/auth';
import { fail, ok } from '@/lib/http';

const safe=(row:any)=>({...row,apiKeyConfigured:!!process.env.KURAIMI_API_KEY,webhookSecretConfigured:!!process.env.KURAIMI_WEBHOOK_SECRET});
export async function GET(){try{await requireUser('platform_admin');const db=await getDb();const[row]=await db.select().from(paymentGatewaySettings).where(eq(paymentGatewaySettings.provider,'kuraimi')).limit(1);return ok({settings:safe(row)})}catch(error){return fail(error)}}
export async function PATCH(request:Request){try{
  const admin=await requireUser('platform_admin');const body=await request.json();const db=await getDb();
  const apiBaseUrl=String(body.apiBaseUrl||'').trim(),merchantId=String(body.merchantId||'').trim();
  const createPaymentPath=String(body.createPaymentPath||'/payments').trim();const enabled=body.enabled===true;
  if(apiBaseUrl){const url=new URL(apiBaseUrl);if(!['https:','http:'].includes(url.protocol))throw new Error('Enter a valid Kuraimi API URL.');}
  if(enabled&&(!process.env.KURAIMI_API_KEY||!apiBaseUrl||!merchantId))throw new Error('Add the secure KURAIMI_API_KEY environment variable, API URL, and merchant ID before enabling automatic payments.');
  const[saved]=await db.update(paymentGatewaySettings).set({enabled,apiBaseUrl,merchantId,createPaymentPath,updatedBy:admin.id,updatedAt:new Date()})
    .where(eq(paymentGatewaySettings.provider,'kuraimi')).returning();
  return ok({settings:safe(saved)});
}catch(error){return fail(error)}}
