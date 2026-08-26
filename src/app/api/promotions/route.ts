import { desc, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { promotionVehicles, promotions } from '@/db/schema';
import { requireUser } from '@/lib/auth';
import { fail, ok } from '@/lib/http';
import { promotionState } from '@/lib/pricing';

export async function GET(){try{const user=await requireUser('company');const db=await getDb();const rows=await db.select().from(promotions).where(eq(promotions.companyId,user.companyId!)).orderBy(desc(promotions.createdAt));const links=await db.select().from(promotionVehicles);return ok({promotions:rows.map((p:any)=>({...p,state:promotionState(p),vehicleIds:links.filter((l:any)=>l.promotionId===p.id).map((l:any)=>l.vehicleId)}))})}catch(error){return fail(error)}}
export async function POST(request:Request){try{const user=await requireUser('company');const body=await request.json();if(!body.name||!body.code||!body.startsAt||!body.endsAt)throw new Error('Complete all promotion fields.');if(new Date(body.endsAt)<=new Date(body.startsAt))throw new Error('End date must be after start date.');const db=await getDb();const[row]=await db.insert(promotions).values({companyId:user.companyId!,name:body.name,code:body.code.toUpperCase(),type:body.type||'percentage',value:Number(body.value),appliesTo:body.appliesTo||'all',startsAt:new Date(body.startsAt),endsAt:new Date(body.endsAt),enabled:body.enabled!==false,minQuantity:Number(body.minQuantity||1)}).returning();if(row.appliesTo==='selected'&&body.vehicleIds?.length)await db.insert(promotionVehicles).values(body.vehicleIds.map((id:number)=>({promotionId:row.id,vehicleId:id})));return ok({promotion:{...row,state:promotionState(row),vehicleIds:body.vehicleIds||[]}},201)}catch(error){return fail(error)}}
