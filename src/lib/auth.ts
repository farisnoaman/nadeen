import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { companies, users } from '@/db/schema';

const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'fleetflow-local-development-secret-change-in-production');
const COOKIE = 'ff_session';

export type SessionUser = {
  id: number; name: string; email: string; role: 'renter' | 'company'; companyId: number | null;
  companyName: string | null; avatar: string | null;
};

export async function createSession(user: SessionUser) {
  const token = await new SignJWT({ ...user }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('7d').sign(secret);
  const jar = await cookies();
  jar.set(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 60 * 60 * 24 * 7 });
}

export async function clearSession() {
  const jar = await cookies();
  jar.set(COOKIE, '', { httpOnly: true, expires: new Date(0), path: '/' });
}

export async function getSession(): Promise<SessionUser | null> {
  try {
    const token = (await cookies()).get(COOKIE)?.value;
    if (!token) return null;
    const { payload } = await jwtVerify(token, secret);
    return payload as unknown as SessionUser;
  } catch { return null; }
}

export async function requireUser(role?: 'renter' | 'company') {
  const user = await getSession();
  if (!user) throw new AuthError('Authentication required', 401);
  if (role && user.role !== role) throw new AuthError('You do not have permission to do that', 403);
  return user;
}

export async function loadSessionUser(userId: number): Promise<SessionUser> {
  const db = await getDb();
  const [row] = await db.select({
    id: users.id, name: users.name, email: users.email, role: users.role, companyId: users.companyId,
    avatar: users.avatar, companyName: companies.name,
  }).from(users).leftJoin(companies, eq(users.companyId, companies.id)).where(eq(users.id, userId)).limit(1);
  return row as SessionUser;
}

export class AuthError extends Error { constructor(message: string, public status = 401) { super(message); } }
