const SESSION_TOKEN = 'ff_session_token';
let memorySessionToken: string | null = null;

export function saveSessionToken(token?: string | null) {
  if (typeof window === 'undefined') return;
  memorySessionToken = token || null;
  if (token) sessionStorage.setItem(SESSION_TOKEN, token);
  else sessionStorage.removeItem(SESSION_TOKEN);
}

export async function apiFile(path: string) {
  const token = typeof window !== 'undefined' ? (memorySessionToken || sessionStorage.getItem(SESSION_TOKEN)) : null;
  const response = await fetch(`/api${path}`, {
    credentials: 'include',
    headers: token ? { 'X-FleetFlow-Session': token } : {},
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || 'Unable to download the file.');
  }
  return response.blob();
}

export async function api<T=any>(path:string,options:RequestInit={}){
  const token=typeof window!=='undefined'?(memorySessionToken||sessionStorage.getItem(SESSION_TOKEN)):null;
  const response=await fetch(`/api${path}`,{
    credentials:'include',
    ...options,
    headers:{'Content-Type':'application/json',...(token?{'X-FleetFlow-Session':token}:{}),...options.headers},
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok){
    const error:any=new Error(data.error||'Something went wrong');
    Object.assign(error,data);error.status=response.status;throw error;
  }
  if(path==='/auth/logout')saveSessionToken(null);
  return data as T;
}
