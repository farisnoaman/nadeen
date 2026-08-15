import bcrypt from 'bcryptjs';
import { getDb } from '@/db';
import { companies, users } from '@/db/schema';
import { createSession, loadSessionUser } from '@/lib/auth';
import { fail, ok } from '@/lib/http';

export async function POST(request:Request){try{const body=await request.json();if(!body.name||!body.email||!body.password||body.password.length<8)throw new Error('Complete every field; passwords need at least 8 characters.');const db=await getDb();let companyId:null|number=null;if(body.role==='company'){if(!body.companyName)throw new Error('Company name is required.');const slug=`${body.companyName.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'')}-${Date.now().toString().slice(-5)}`;const[company]=await db.insert(companies).values({name:body.companyName,slug,logo:body.companyName.match(/\b\w/g)?.slice(0,2).join('').toUpperCase()||'FF'}).returning();companyId=company.id}const hash=await bcrypt.hash(body.password,10);const[userRow]=await db.insert(users).values({name:body.name,email:body.email.trim().toLowerCase(),passwordHash:hash,role:body.role==='company'?'company':'renter',companyId,avatar:body.name.match(/\b\w/g)?.slice(0,2).join('').toUpperCase()}).returning();const user=await loadSessionUser(userRow.id);await createSession(user);return ok({user},201)}catch(error){return fail(error)}}
