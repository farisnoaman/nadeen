import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { users, userSettings } from '@/db/schema';
import { createSession, loadSessionUser } from '@/lib/auth';
import { applicationOrigin, exchangeOAuthCode, oauthProvider, safeReturnPath } from '@/lib/oauth';

export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const requestUrl = new URL(request.url);
  const appOrigin = applicationOrigin(request);
  const loginError = (message: string) => {
    const target = new URL('/login', appOrigin);
    target.searchParams.set('authError', message);
    return NextResponse.redirect(target);
  };
  try {
    const { provider: value } = await params;
    const provider = oauthProvider(value);
    if (requestUrl.searchParams.get('error')) return loginError('Social sign-in was cancelled.');
    const code = requestUrl.searchParams.get('code');
    const state = requestUrl.searchParams.get('state');
    const jar = await cookies();
    if (!code || !state || jar.get('ff_oauth_state')?.value !== `${provider}:${state}`) {
      return loginError('The social sign-in request expired or could not be verified.');
    }
    const redirectUri = `${appOrigin}/api/auth/oauth/${provider}/callback`;
    const profile = await exchangeOAuthCode(provider, code, redirectUri);
    const db = await getDb();
    let [account] = await db.select({ id:users.id }).from(users).where(eq(users.email, profile.email)).limit(1);
    if (!account) {
      const passwordHash = await bcrypt.hash(randomUUID(), 10);
      const [created] = await db.insert(users).values({
        name:profile.name, email:profile.email, passwordHash, role:'renter',
        avatar:profile.name.split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase(),
      }).returning({ id:users.id });
      await db.insert(userSettings).values({ userId:created.id });
      account = created;
    }
    const user = await loadSessionUser(account.id);
    await createSession(user, request);
    const destination = safeReturnPath(jar.get('ff_oauth_return')?.value);
    const response = NextResponse.redirect(new URL(destination, appOrigin));
    response.cookies.delete('ff_oauth_state');
    response.cookies.delete('ff_oauth_return');
    return response;
  } catch (error: any) {
    return loginError(error.message || 'Social sign-in failed.');
  }
}
