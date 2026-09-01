import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { platformSettings } from '@/db/schema';
import { requireUser } from '@/lib/auth';
import { fail, ok } from '@/lib/http';

const DEFAULT_EMAIL = 'support@fleetflow.app';

async function loadSettings(db: any) {
  const [row] = await db.select().from(platformSettings).where(eq(platformSettings.id, 1)).limit(1);
  if (row) return row;
  const [created] = await db.insert(platformSettings).values({ id: 1 }).onConflictDoNothing().returning();
  return created ?? { id: 1, supportPhones: [], supportEmail: null };
}

export async function GET() {
  try {
    await requireUser();
    const db = await getDb();
    const row = await loadSettings(db);
    return ok({ supportPhones: row.supportPhones || [], supportEmail: row.supportEmail || DEFAULT_EMAIL });
  } catch (error) { return fail(error); }
}

export async function PATCH(request: Request) {
  try {
    const admin = await requireUser('platform_admin');
    const body = await request.json();
    const db = await getDb();
    const phones = Array.isArray(body.supportPhones)
      ? body.supportPhones.map((entry: any) => ({
          label: String(entry?.label ?? '').trim().slice(0, 40),
          phone: String(entry?.phone ?? '').replace(/[^\d+()\-\s]/g, '').trim(),
        })).filter((entry: any) => entry.phone)
      : [];
    if (phones.length > 10) throw new Error('You can store up to 10 support numbers.');
    for (const entry of phones) if (entry.phone.replace(/\D/g, '').length < 6) throw new Error('Enter a valid support phone number.');
    const email = String(body.supportEmail || '').trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid support email.');
    await loadSettings(db);
    const [saved] = await db.update(platformSettings).set({
      supportPhones: phones,
      supportEmail: email || null,
      updatedBy: admin.id,
      updatedAt: new Date(),
    }).where(eq(platformSettings.id, 1)).returning();
    return ok({ supportPhones: saved.supportPhones || [], supportEmail: saved.supportEmail || DEFAULT_EMAIL });
  } catch (error) { return fail(error); }
}
