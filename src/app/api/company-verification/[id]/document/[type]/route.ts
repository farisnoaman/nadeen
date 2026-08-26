import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { companyVerificationRequests } from '@/db/schema';
import { requireUser } from '@/lib/auth';
import { fail, ok } from '@/lib/http';

const fields={
  business:{name:'businessRegistrationName',mime:'businessRegistrationMime',data:'businessRegistrationData'},
  tax:{name:'taxCertificateName',mime:'taxCertificateMime',data:'taxCertificateData'},
  owner:{name:'ownerIdentityName',mime:'ownerIdentityMime',data:'ownerIdentityData'},
} as const;

export async function GET(_:Request,{params}:{params:Promise<{id:string;type:string}>}){try{
  const user=await requireUser(undefined,{allowUnverifiedCompany:true});const {id,type}=await params;const field=fields[type as keyof typeof fields];
  if(!field)return ok({error:'Document not found.'},404);
  const db=await getDb();const[row]=await db.select().from(companyVerificationRequests)
    .where(eq(companyVerificationRequests.id,Number(id))).limit(1);
  if(!row||!(user.role==='platform_admin'||(user.role==='company'&&user.companyId===row.companyId)))return ok({error:'Document not found.'},404);
  const name=String(row[field.name]).replace(/["\\\r\n]/g,'_');
  return new Response(Buffer.from(String(row[field.data]),'base64'),{
    headers:{'Content-Type':String(row[field.mime]),'Content-Disposition':`inline; filename="${name}"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'},
  });
}catch(error){return fail(error)}}
