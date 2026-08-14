import { getDb } from '@/db';
import { users } from '@/db/schema';
import { sql } from 'drizzle-orm';
import { fail, ok } from '@/lib/http';
export async function GET(){try{const db=await getDb();const[result]=await db.select({count:sql<number>`count(*)`}).from(users);return ok({status:'ok',database:'connected',users:Number(result.count),timestamp:new Date().toISOString()})}catch(error){return fail(error)}}
