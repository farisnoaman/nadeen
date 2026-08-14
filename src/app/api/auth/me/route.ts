import { getSession } from '@/lib/auth';
import { ok } from '@/lib/http';
export async function GET(){const user=await getSession();return user?ok({user}):ok({error:'Not authenticated'},401)}
