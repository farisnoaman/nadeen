export type OAuthProvider = 'google' | 'facebook';

type OAuthProfile = { subject: string; email: string; name: string };

export function oauthProvider(value: string): OAuthProvider {
  if (value !== 'google' && value !== 'facebook') throw new Error('Unsupported sign-in provider.');
  return value;
}

export function oauthConfig(provider: OAuthProvider) {
  if (provider === 'google') {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) throw new Error('Google sign-in is not configured.');
    return { clientId, clientSecret };
  }
  const clientId = process.env.FACEBOOK_APP_ID;
  const clientSecret = process.env.FACEBOOK_APP_SECRET;
  if (!clientId || !clientSecret) throw new Error('Facebook sign-in is not configured.');
  return { clientId, clientSecret };
}

export function oauthAuthorizationUrl(provider: OAuthProvider, redirectUri: string, state: string) {
  const { clientId } = oauthConfig(provider);
  if (provider === 'google') {
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.search = new URLSearchParams({ client_id:clientId, redirect_uri:redirectUri, response_type:'code', scope:'openid email profile', state, prompt:'select_account' }).toString();
    return url;
  }
  const version = process.env.FACEBOOK_GRAPH_VERSION || 'v21.0';
  const url = new URL(`https://www.facebook.com/${version}/dialog/oauth`);
  url.search = new URLSearchParams({ client_id:clientId, redirect_uri:redirectUri, response_type:'code', scope:'email,public_profile', state }).toString();
  return url;
}

export async function exchangeOAuthCode(provider: OAuthProvider, code: string, redirectUri: string): Promise<OAuthProfile> {
  const { clientId, clientSecret } = oauthConfig(provider);
  if (provider === 'google') {
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method:'POST', headers:{ 'Content-Type':'application/x-www-form-urlencoded' },
      body:new URLSearchParams({ code, client_id:clientId, client_secret:clientSecret, redirect_uri:redirectUri, grant_type:'authorization_code' }),
    });
    if (!tokenResponse.ok) throw new Error('Google could not verify this sign-in request.');
    const token = await tokenResponse.json();
    const profileResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers:{ Authorization:`Bearer ${token.access_token}` } });
    if (!profileResponse.ok) throw new Error('Google profile access failed.');
    const profile = await profileResponse.json();
    if (!profile.sub || !profile.email || profile.email_verified !== true) throw new Error('Google did not provide a verified email address.');
    return { subject:String(profile.sub), email:String(profile.email).toLowerCase(), name:String(profile.name || profile.email.split('@')[0]) };
  }
  const version = process.env.FACEBOOK_GRAPH_VERSION || 'v21.0';
  const tokenUrl = new URL(`https://graph.facebook.com/${version}/oauth/access_token`);
  tokenUrl.search = new URLSearchParams({ client_id:clientId, client_secret:clientSecret, redirect_uri:redirectUri, code }).toString();
  const tokenResponse = await fetch(tokenUrl);
  if (!tokenResponse.ok) throw new Error('Facebook could not verify this sign-in request.');
  const token = await tokenResponse.json();
  const profileUrl = new URL(`https://graph.facebook.com/${version}/me`);
  profileUrl.search = new URLSearchParams({ fields:'id,name,email', access_token:token.access_token }).toString();
  const profileResponse = await fetch(profileUrl);
  if (!profileResponse.ok) throw new Error('Facebook profile access failed.');
  const profile = await profileResponse.json();
  if (!profile.id) throw new Error('Facebook did not provide an account identifier.');
  return {
    subject:String(profile.id),
    email:profile.email ? String(profile.email).toLowerCase() : `facebook-${profile.id}@oauth.fleetflow.local`,
    name:String(profile.name || 'Facebook renter'),
  };
}

export function applicationOrigin(request: Request) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
  const url = new URL(request.url);
  const host = (request.headers.get('x-forwarded-host') || request.headers.get('host') || url.host).split(',')[0].trim();
  const protocol = (request.headers.get('x-forwarded-proto') || url.protocol.replace(':', '')).split(',')[0].trim();
  return `${protocol === 'https' ? 'https' : 'http'}://${host}`.replace(/\/$/, '');
}

export function safeReturnPath(value: unknown, fallback = '/dashboard/browse') {
  const path = String(value || '');
  return /^\/(?!\/)[^\\\r\n]*$/.test(path) ? path : fallback;
}
