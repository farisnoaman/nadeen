import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { users } from '@/db/schema';
import { createSession, loadSessionUser } from '@/lib/auth';
import { fail, ok } from '@/lib/http';

export async function POST(request:Request){try{const{email,password}=await request.json();const db=await getDb();const[row]=await db.select().from(users).where(eq(users.email,String(email||'').trim().toLowerCase())).limit(1);if(!row||!await bcrypt.compare(String(password||''),row.passwordHash))return ok({error:'Email or password is incorrect'},401);const user=await loadSessionUser(row.id);await createSession(user);return ok({user})}catch(error){return fail(error)}}
