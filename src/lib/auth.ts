import { cookies, headers } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { AccountRole, companies, CompanyVerificationStatus, users } from '@/db/schema';

const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'fleetflow-local-development-secret-change-in-production');
const COOKIE = 'ff_session';

export type SessionUser = {
  id: number; name: string; email: string; role: AccountRole; companyId: number | null;
  companyName: string | null; avatar: string | null; verificationStatus: CompanyVerificationStatus | null;
};

function sessionCookieOptions(request?: Request) {
  const origin = request?.headers.get('origin') || '';
  const forwardedProto = request?.headers.get('x-forwarded-proto') || '';
  const secure = process.env.NODE_ENV === 'production' || origin.startsWith('https://') || forwardedProto === 'https';
  return {
    httpOnly: true, path: '/', secure,
    sameSite: secure ? 'none' as const : 'lax' as const,
    partitioned: secure,
  };
}

export async function createSession(user: SessionUser, request?: Request) {
  const token = await new SignJWT({ ...user }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('7d').sign(secret);
  const jar = await cookies();
  jar.set(COOKIE, token, { ...sessionCookieOptions(request), maxAge: 60 * 60 * 24 * 7 });
  return token;
}

export async function clearSession(request?: Request) {
  const jar = await cookies();
  jar.set(COOKIE, '', { ...sessionCookieOptions(request), expires: new Date(0) });
}

export async function getSession(): Promise<SessionUser | null> {
  const cookieToken = (await cookies()).get(COOKIE)?.value;
  const requestHeaders = await headers();
  const authorization = requestHeaders.get('authorization') || '';
  const bearerToken = authorization.startsWith('Bearer ') ? authorization.slice(7) : null;
  const previewToken = requestHeaders.get('x-fleetflow-session');
  for (const token of [cookieToken, previewToken, bearerToken]) {
    if (!token) continue;
    try {
      const { payload } = await jwtVerify(token, secret);
      return payload as unknown as SessionUser;
    } catch { /* Try the next available session transport. */ }
  }
  return null;
}

export async function requireUser(role?: AccountRole, options:{allowUnverifiedCompany?:boolean}={}) {
  const user = await getSession();
  if (!user) throw new AuthError('Authentication required', 401);
  if (role && user.role !== role) throw new AuthError('You do not have permission to do that', 403);
  if (user.role === 'company' && user.companyId && !options.allowUnverifiedCompany) {
    const db=await getDb();
    const[company]=await db.select({verificationStatus:companies.verificationStatus,subscriptionStatus:companies.subscriptionStatus,operationalStatus:companies.operationalStatus})
      .from(companies).where(eq(companies.id,user.companyId)).limit(1);
    if(!company||company.verificationStatus!=='verified')throw new AuthError('Your company must be verified by the platform administrator before using this feature.',403);
    if(company.subscriptionStatus!=='active')throw new AuthError('An active subscription is required before using this feature.',403);
    if(company.operationalStatus==='deactivated')throw new AuthError('This company has been deactivated by the platform administrator.',403);
  }
  return user;
}

export async function loadSessionUser(userId: number): Promise<SessionUser> {
  const db = await getDb();
  const [row] = await db.select({
    id: users.id, name: users.name, email: users.email, role: users.role, companyId: users.companyId,
    avatar: users.avatar, companyName: companies.name, verificationStatus:companies.verificationStatus,
  }).from(users).leftJoin(companies, eq(users.companyId, companies.id)).where(eq(users.id, userId)).limit(1);
  return row as SessionUser;
}

export class AuthError extends Error { constructor(message: string, public status = 401) { super(message); } }
