import { fail, ok } from '@/lib/http';
import { loadInvoice } from '@/lib/invoice';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const token = new URL(request.url).searchParams.get('token');
    return ok({ invoice: await loadInvoice(Number(id), token) });
  } catch (error) { return fail(error); }
}
