import { and, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { maintenanceWorkOrders } from '@/db/schema';
import { requireUser } from '@/lib/auth';
import { fail, ok } from '@/lib/http';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser('company');
    const { id } = await params;
    const db = await getDb();
    const [order] = await db.select({
      name: maintenanceWorkOrders.waybillName,
      mime: maintenanceWorkOrders.waybillMime,
      data: maintenanceWorkOrders.waybillData,
    }).from(maintenanceWorkOrders).where(and(
      eq(maintenanceWorkOrders.id, Number(id)),
      eq(maintenanceWorkOrders.companyId, user.companyId!),
    )).limit(1);
    if (!order?.data) return ok({ error: 'Waybill not found' }, 404);
    const bytes = Buffer.from(order.data, 'base64');
    const safeName = (order.name || 'maintenance-waybill').replace(/["\r\n]/g, '_');
    return new Response(bytes, {
      headers: {
        'Content-Type': order.mime || 'application/octet-stream',
        'Content-Disposition': `inline; filename="${safeName}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    return fail(error);
  }
}
