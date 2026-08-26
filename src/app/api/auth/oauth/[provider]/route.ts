import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { applicationOrigin, oauthAuthorizationUrl, oauthProvider, safeReturnPath } from '@/lib/oauth';

export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const requestUrl = new URL(request.url);
  const appOrigin = applicationOrigin(request);
  try {
    const { provider: value } = await params;
    const provider = oauthProvider(value);
    const state = randomUUID();
    const returnTo = safeReturnPath(requestUrl.searchParams.get('returnTo'));
    const redirectUri = `${appOrigin}/api/auth/oauth/${provider}/callback`;
    const response = NextResponse.redirect(oauthAuthorizationUrl(provider, redirectUri, state));
    const secure = appOrigin.startsWith('https://');
    response.cookies.set('ff_oauth_state', `${provider}:${state}`, { httpOnly:true, secure, sameSite:'lax', path:'/', maxAge:600 });
    response.cookies.set('ff_oauth_return', returnTo, { httpOnly:true, secure, sameSite:'lax', path:'/', maxAge:600 });
    return response;
  } catch (error: any) {
    const target = new URL('/login', appOrigin);
    target.searchParams.set('authError', error.message || 'Social sign-in is unavailable.');
    return NextResponse.redirect(target);
  }
}
