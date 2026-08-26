import { asc, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { platformBankAccounts } from '@/db/schema';
import { requireUser } from '@/lib/auth';
import { fail, ok } from '@/lib/http';

const channels={
  KURAIMI_SAR:{label:'Kuraimi Bank SAR',currency:'SAR'},
  KURAIMI_USD:{label:'Kuraimi Bank USD',currency:'USD'},
  KURAIMI_YER_NEW:{label:'Kuraimi Bank YER (new)',currency:'YER'},
  KURAIMI_YER_OLD:{label:'Kuraimi Bank YER (old)',currency:'YER'},
} as const;

export async function GET(){try{await requireUser('platform_admin');const db=await getDb();return ok({accounts:await db.select().from(platformBankAccounts).orderBy(asc(platformBankAccounts.id))})}catch(error){return fail(error)}}
export async function POST(request:Request){try{
  await requireUser('platform_admin');const body=await request.json();const db=await getDb();
  const code=String(body.code||'') as keyof typeof channels;const channel=channels[code];
  if(!channel)throw new Error('Choose a valid Kuraimi bank account channel.');
  const accountNumber=String(body.accountNumber||'').trim();const accountHolder=String(body.accountHolder||'').trim();const instructions=String(body.instructions||'').trim();
  if(accountNumber.length<4)throw new Error('Enter a valid bank account number.');
  if(!accountHolder)throw new Error('Enter the account holder name.');
  const[existing]=await db.select().from(platformBankAccounts).where(eq(platformBankAccounts.code,code)).limit(1);
  if(existing?.accountNumber)throw new Error('This bank account channel is already configured. Edit the existing account instead.');
  const values={code,bankName:'Al Kuraimi Bank',label:channel.label,currency:channel.currency,accountNumber,accountHolder,instructions,active:body.active!==false,updatedAt:new Date()};
  const[saved]=existing
    ?await db.update(platformBankAccounts).set(values).where(eq(platformBankAccounts.id,existing.id)).returning()
    :await db.insert(platformBankAccounts).values(values).returning();
  return ok({account:saved},201);
}catch(error){return fail(error)}}
export async function PATCH(request:Request){try{
  await requireUser('platform_admin');const body=await request.json();const db=await getDb();
  const[id]=await db.select().from(platformBankAccounts).where(eq(platformBankAccounts.id,Number(body.id))).limit(1);
  if(!id)throw new Error('Bank account slot not found.');
  const accountNumber=String(body.accountNumber||'').trim();const accountHolder=String(body.accountHolder||'').trim();
  const instructions=String(body.instructions||'').trim();const active=body.active===true;
  if(active&&accountNumber.length<4)throw new Error('Enter the bank account number before making it visible.');
  if(!accountHolder)throw new Error('Enter the account holder name.');
  const[saved]=await db.update(platformBankAccounts).set({accountNumber,accountHolder,instructions,active,updatedAt:new Date()})
    .where(eq(platformBankAccounts.id,id.id)).returning();
  return ok({account:saved});
}catch(error){return fail(error)}}
