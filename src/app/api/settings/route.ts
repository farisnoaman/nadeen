import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { companies, userSettings, users } from '@/db/schema';
import { createSession, loadSessionUser, requireUser } from '@/lib/auth';
import { fail, ok } from '@/lib/http';
import { companyLoyaltySettings, saveCompanyLoyaltySettings } from '@/lib/loyalty';

async function ensurePreferences(db: any, userId: number) {
  await db.insert(userSettings).values({ userId }).onConflictDoNothing();
  const [preferences] = await db.select().from(userSettings)
    .where(eq(userSettings.userId, userId)).limit(1);
  return preferences;
}

export async function GET() {
  try {
    const user = await requireUser(undefined,{allowUnverifiedCompany:true});
    const db = await getDb();
    const [profile] = await db.select({
      id: users.id,
      name: users.name,
      email: users.email,
      phone: users.phone,
      avatar: users.avatar,
      role: users.role,
      companyId: users.companyId,
      companyName: companies.name,
      companyCity: companies.city,
      createdAt: users.createdAt,
    }).from(users)
      .leftJoin(companies, eq(users.companyId, companies.id))
      .where(eq(users.id, user.id))
      .limit(1);
    if (!profile) return ok({ error: 'Account not found' }, 404);
    const preferences = await ensurePreferences(db, user.id);
    const loyalty = user.role === 'company' && user.companyId
      ? await companyLoyaltySettings(db, user.companyId)
      : null;
    return ok({ profile, preferences, loyalty });
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireUser(undefined,{allowUnverifiedCompany:true});
    const body = await request.json();
    const db = await getDb();

    if (body.action === 'profile') {
      const name = String(body.name || '').trim();
      const phone = String(body.phone || '').trim();
      if (name.length < 2 || name.length > 80) throw new Error('Enter a name between 2 and 80 characters.');
      if (phone.length > 30) throw new Error('Enter a valid phone number.');
      const initials = name.split(/\s+/).map(part => Array.from(part)[0] || '').slice(0, 2).join('').toUpperCase();
      let companyName: string | null = null;
      let companyCity: string | null = null;
      if (user.role === 'company' && user.companyId) {
        companyName = String(body.companyName || '').trim();
        companyCity = String(body.companyCity || '').trim();
        if (companyName.length < 2 || companyName.length > 100) throw new Error('Enter a company name between 2 and 100 characters.');
        if (companyCity.length < 2 || companyCity.length > 100) throw new Error('Enter a valid company location.');
      }

      await db.update(users).set({ name, phone: phone || null, avatar: initials })
        .where(eq(users.id, user.id));
      if (companyName && companyCity && user.companyId) {
        await db.update(companies).set({ name: companyName, city: companyCity })
          .where(eq(companies.id, user.companyId));
      }

      const sessionUser = await loadSessionUser(user.id);
      const sessionToken = await createSession(sessionUser, request);
      const [profile] = await db.select({
        id: users.id,
        name: users.name,
        email: users.email,
        phone: users.phone,
        avatar: users.avatar,
        role: users.role,
        companyId: users.companyId,
        companyName: companies.name,
        companyCity: companies.city,
        createdAt: users.createdAt,
      }).from(users)
        .leftJoin(companies, eq(users.companyId, companies.id))
        .where(eq(users.id, user.id)).limit(1);
      return ok({ profile, user: sessionUser, sessionToken });
    }

    if (body.action === 'preferences') {
      const booleanFields = [
        'emailNotifications', 'inAppNotifications', 'rentalNotifications',
        'messageNotifications', 'billingNotifications', 'marketingNotifications', 'weeklySummary',
      ] as const;
      const changes: Record<string, boolean | string | Date> = { updatedAt: new Date() };
      for (const field of booleanFields) {
        if (typeof body[field] === 'boolean') changes[field] = body[field];
      }
      if (body.language !== undefined) {
        if (!['en', 'ar'].includes(body.language)) throw new Error('Choose a valid language.');
        changes.language = body.language;
      }
      if (body.theme !== undefined) {
        if (!['light', 'dark'].includes(body.theme)) throw new Error('Choose a valid theme.');
        changes.theme = body.theme;
      }
      await ensurePreferences(db, user.id);
      const [preferences] = await db.update(userSettings).set(changes)
        .where(eq(userSettings.userId, user.id)).returning();
      return ok({ preferences });
    }

    if (body.action === 'loyalty') {
      if (user.role !== 'company' || !user.companyId) throw new Error('Only company administrators can manage loyalty settings.');
      const loyalty = await saveCompanyLoyaltySettings(db, user.companyId, body);
      return ok({ loyalty });
    }

    if (body.action === 'password') {
      const currentPassword = String(body.currentPassword || '');
      const newPassword = String(body.newPassword || '');
      if (newPassword.length < 8 || newPassword.length > 128) {
        throw new Error('The new password must contain between 8 and 128 characters.');
      }
      const [account] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
      if (!account || !await bcrypt.compare(currentPassword, account.passwordHash)) {
        return ok({ error: 'Your current password is incorrect.' }, 400);
      }
      if (await bcrypt.compare(newPassword, account.passwordHash)) {
        throw new Error('Choose a password that is different from your current password.');
      }
      const passwordHash = await bcrypt.hash(newPassword, 10);
      await db.update(users).set({ passwordHash }).where(eq(users.id, user.id));
      return ok({ changed: true });
    }

    throw new Error('Choose a valid settings action.');
  } catch (error) {
    return fail(error);
  }
}
