import { and, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { maintenanceItems } from '@/db/schema';
import { requireUser } from '@/lib/auth';
import { fail, ok } from '@/lib/http';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser('company');
    const { id } = await params;
    const body = await request.json();
    const db = await getDb();
    const [existing] = await db.select().from(maintenanceItems).where(and(
      eq(maintenanceItems.id, Number(id)),
      eq(maintenanceItems.companyId, user.companyId!),
    )).limit(1);
    if (!existing) return ok({ error: 'Maintenance item not found' }, 404);
    const [item] = await db.update(maintenanceItems).set({
      active: typeof body.active === 'boolean' ? body.active : existing.active,
      name: body.name ? String(body.name).trim().slice(0, 120) : existing.name,
      description: body.description === undefined ? existing.description : String(body.description).trim(),
      intervalDays: body.intervalDays === undefined ? existing.intervalDays : Math.max(0, Number(body.intervalDays) || 0) || null,
      intervalKm: body.intervalKm === undefined ? existing.intervalKm : Math.max(0, Number(body.intervalKm) || 0) || null,
      defaultDurationHours: body.defaultDurationHours === undefined ? existing.defaultDurationHours : Math.max(0.5, Math.min(72, Number(body.defaultDurationHours))),
    }).where(eq(maintenanceItems.id, existing.id)).returning();
    return ok({ item });
  } catch (error) {
    return fail(error);
  }
}
