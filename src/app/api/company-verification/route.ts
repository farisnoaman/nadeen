import { desc, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { companies, companyVerificationRequests, notifications, paymentGatewaySettings, platformBankAccounts, subscriptionPlans, users } from '@/db/schema';
import { requireUser } from '@/lib/auth';
import { fail, ok } from '@/lib/http';
import { companyEntitlement } from '@/lib/platform';

const ALLOWED_MIME = new Set(['application/pdf','image/jpeg','image/png','image/webp']);
const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;
function documentValue(value:any,label:string){
  const name=String(value?.name||'').trim().replace(/[\r\n]/g,'').slice(0,180);
  const mime=String(value?.mime||'').toLowerCase();
  const data=String(value?.data||'').replace(/^data:[^;]+;base64,/, '').replace(/\s/g,'');
  if(!name||!ALLOWED_MIME.has(mime)||!data)throw new Error(`${label} must be a PDF, JPG, PNG, or WebP file.`);
  if(!/^[A-Za-z0-9+/]+={0,2}$/.test(data))throw new Error(`${label} is not a valid file.`);
  const bytes=Buffer.from(data,'base64');
  if(!bytes.length||bytes.length>MAX_DOCUMENT_BYTES)throw new Error(`${label} must be no larger than 5 MB.`);
  const validSignature=mime==='application/pdf'?bytes.subarray(0,5).toString()==='%PDF-'
    :mime==='image/jpeg'?bytes[0]===0xff&&bytes[1]===0xd8
      :mime==='image/png'?bytes.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))
        :bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP';
  if(!validSignature)throw new Error(`${label} file contents do not match its file type.`);
  return {name,mime,data:bytes.toString('base64')};
}

export async function GET(){try{
  const user=await requireUser(undefined,{allowUnverifiedCompany:true});if(user.role!=='company'||!user.companyId)throw new Error('Company administrator access required.');const db=await getDb();
  const [company]=await db.select().from(companies).where(eq(companies.id,user.companyId!)).limit(1);
  if(!company)throw new Error('Company not found.');
  const [requests,plans,banks,gateway,entitlement]=await Promise.all([
    db.select({
      id:companyVerificationRequests.id,attempt:companyVerificationRequests.attempt,status:companyVerificationRequests.status,
      subscriptionPaymentCode:companyVerificationRequests.subscriptionPaymentCode,reviewNotes:companyVerificationRequests.reviewNotes,
      reviewedAt:companyVerificationRequests.reviewedAt,createdAt:companyVerificationRequests.createdAt,
      planId:subscriptionPlans.id,planCode:subscriptionPlans.code,planName:subscriptionPlans.name,
      businessRegistrationName:companyVerificationRequests.businessRegistrationName,
      taxCertificateName:companyVerificationRequests.taxCertificateName,ownerIdentityName:companyVerificationRequests.ownerIdentityName,
    }).from(companyVerificationRequests).innerJoin(subscriptionPlans,eq(companyVerificationRequests.subscriptionPlanId,subscriptionPlans.id))
      .where(eq(companyVerificationRequests.companyId,company.id)).orderBy(desc(companyVerificationRequests.createdAt)),
    db.select().from(subscriptionPlans).where(eq(subscriptionPlans.active,true)),
    db.select().from(platformBankAccounts).where(eq(platformBankAccounts.active,true)),
    db.select().from(paymentGatewaySettings).where(eq(paymentGatewaySettings.provider,'kuraimi')).limit(1),
    companyEntitlement(db,company.id),
  ]);
  const gatewayRow=gateway[0];
  return ok({company,requests,latestRequest:requests[0]||null,plans,banks,entitlement,
    kuraimiPayment:{enabled:!!gatewayRow?.enabled,configured:!!(process.env.KURAIMI_API_KEY&&gatewayRow?.apiBaseUrl&&gatewayRow?.merchantId)}});
}catch(error){return fail(error)}}

export async function POST(request:Request){try{
  const user=await requireUser(undefined,{allowUnverifiedCompany:true});if(user.role!=='company'||!user.companyId)throw new Error('Company administrator access required.');const body=await request.json();const db=await getDb();
  const [company]=await db.select().from(companies).where(eq(companies.id,user.companyId!)).limit(1);
  if(!company)throw new Error('Company not found.');
  if(company.verificationStatus==='verified')throw new Error('This company is already verified.');
  const [latest]=await db.select().from(companyVerificationRequests).where(eq(companyVerificationRequests.companyId,company.id))
    .orderBy(desc(companyVerificationRequests.createdAt)).limit(1);
  if(latest&&latest.status!=='rejected')throw new Error('A verification request can only be resubmitted after rejection.');
  const [plan]=await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.code,String(body.planCode||'').trim().toUpperCase())).limit(1);
  if(!plan||!plan.active)throw new Error('Choose an active subscription package.');
  const paymentCode=String(body.subscriptionPaymentCode||'').trim();
  if(paymentCode.length<4||paymentCode.length>100)throw new Error('Enter the subscription fee transfer or payment reference code.');
  const business=documentValue(body.businessRegistration,'Business registration');
  const tax=documentValue(body.taxCertificate,'Tax certificate');
  const owner=documentValue(body.ownerIdentity,'Owner ID or passport');
  const saved=await db.transaction(async(tx:any)=>{
    const [row]=await tx.insert(companyVerificationRequests).values({
      companyId:company.id,submittedBy:user.id,subscriptionPlanId:plan.id,attempt:(latest?.attempt||0)+1,
      subscriptionPaymentCode:paymentCode,
      businessRegistrationName:business.name,businessRegistrationMime:business.mime,businessRegistrationData:business.data,
      taxCertificateName:tax.name,taxCertificateMime:tax.mime,taxCertificateData:tax.data,
      ownerIdentityName:owner.name,ownerIdentityMime:owner.mime,ownerIdentityData:owner.data,
    }).returning();
    await tx.update(companies).set({verificationStatus:'pending'}).where(eq(companies.id,company.id));
    const admins=await tx.select({id:users.id}).from(users).where(eq(users.role,'platform_admin'));
    if(admins.length)await tx.insert(notifications).values(admins.map((admin:any)=>({
      userId:admin.id,type:'system' as const,body:`Company verification · ${company.name}`,
      href:'/dashboard/admin/verifications',entityType:'company_verification',entityId:row.id,dedupeKey:`company-verification-${row.id}`,
    }))).onConflictDoNothing();
    return row;
  });
  return ok({request:{id:saved.id,status:saved.status,attempt:saved.attempt}},201);
}catch(error){return fail(error)}}
