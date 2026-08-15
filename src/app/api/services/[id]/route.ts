import { and, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { premiumServices, rentalServices } from '@/db/schema';
import { requireUser } from '@/lib/auth';
import { fail, ok } from '@/lib/http';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser('company');
    const { id } = await params;
    const db = await getDb();
    const [existing] = await db.select().from(premiumServices).where(and(
      eq(premiumServices.id, Number(id)), eq(premiumServices.companyId, user.companyId!),
    )).limit(1);
    if (!existing) return ok({ error: 'Service not found' }, 404);
    const body = await request.json();
    const changes: any = {};
    for (const key of ['name', 'description', 'active']) if (body[key] !== undefined) changes[key] = body[key];
    if (body.dailyPrice !== undefined) changes.dailyPrice = Math.max(0, Number(body.dailyPrice));
    const [service] = await db.update(premiumServices).set(changes).where(eq(premiumServices.id, existing.id)).returning();
    return ok({ service });
  } catch (error) { return fail(error); }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser('company');
    const { id } = await params;
    const db = await getDb();
    const [existing] = await db.select().from(premiumServices).where(and(
      eq(premiumServices.id, Number(id)), eq(premiumServices.companyId, user.companyId!),
    )).limit(1);
    if (!existing) return ok({ error: 'Service not found' }, 404);
    await db.delete(premiumServices).where(eq(premiumServices.id, existing.id));
    return ok({ ok: true });
  } catch (error) { return fail(error); }
}
