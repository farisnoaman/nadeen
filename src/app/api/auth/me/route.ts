import { getSession, loadSessionUser } from '@/lib/auth';
import { ok } from '@/lib/http';

export async function GET(request:Request){
  const session=await getSession();
  if(session){
    try{return ok({user:await loadSessionUser(session.id)})}catch{return ok({error:'Not authenticated'},401)}
  }
  return new URL(request.url).searchParams.get('optional')==='1'
    ? ok({user:null})
    : ok({error:'Not authenticated'},401);
}
