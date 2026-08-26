import { cookies } from 'next/headers';
import { createInvoicePdf, loadInvoice } from '@/lib/invoice';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const token = new URL(request.url).searchParams.get('token');
    const invoice = await loadInvoice(Number(id), token);
    const locale = (await cookies()).get('ff_lang')?.value === 'en' ? 'en' : 'ar';
    const pdf = await createInvoicePdf(invoice, locale);
    return new Response(pdf as BodyInit, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${invoice.invoiceNumber}.pdf"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error: any) {
    return Response.json({ error: error.message || 'Unable to generate invoice' }, { status: 400 });
  }
}
