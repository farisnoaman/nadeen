import { clearSession } from '@/lib/auth';
import { ok } from '@/lib/http';
export async function POST(request:Request){await clearSession(request);return ok({ok:true})}
