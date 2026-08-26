import { getDb } from '@/db';
import { maintenanceItems } from '@/db/schema';
import { requireUser } from '@/lib/auth';
import { fail, ok } from '@/lib/http';

export async function POST(request: Request) {
  try {
    const user = await requireUser('company');
    const body = await request.json();
    const name = String(body.name || '').trim();
    if (name.length < 3 || name.length > 120) throw new Error('Enter a maintenance item name between 3 and 120 characters.');
    const key = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${Date.now().toString(36)}`;
    const db = await getDb();
    const [item] = await db.insert(maintenanceItems).values({
      companyId: user.companyId!,
      key,
      name,
      description: String(body.description || '').trim(),
      intervalDays: Math.max(0, Number(body.intervalDays) || 0) || null,
      intervalKm: Math.max(0, Number(body.intervalKm) || 0) || null,
      defaultDurationHours: Math.max(0.5, Math.min(72, Number(body.defaultDurationHours || 1))),
      active: body.active !== false,
    }).returning();
    return ok({ item }, 201);
  } catch (error) {
    return fail(error);
  }
}
