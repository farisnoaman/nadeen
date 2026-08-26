import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { and, desc, eq, gt, isNull, lt, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { phoneVerificationCodes, users, userSettings } from '@/db/schema';
import { createSession, loadSessionUser } from '@/lib/auth';
import { fail, ok } from '@/lib/http';
import { normalizePhoneNumber } from '@/lib/phone-auth';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const phone = normalizePhoneNumber(body.phone);
    const code = String(body.code || '').trim();
    if (!/^\d{6}$/.test(code)) throw new Error('Enter the 6-digit verification code.');
    const db = await getDb();
    const maxAttempts = Math.max(3, Number(process.env.OTP_MAX_ATTEMPTS) || 5);
    const [challenge] = await db.select().from(phoneVerificationCodes).where(and(
      eq(phoneVerificationCodes.phone, phone),
      isNull(phoneVerificationCodes.consumedAt),
      gt(phoneVerificationCodes.expiresAt, new Date()),
      lt(phoneVerificationCodes.attempts, maxAttempts),
    )).orderBy(desc(phoneVerificationCodes.createdAt)).limit(1);
    if (!challenge) throw new Error('The verification code is expired or unavailable. Request a new code.');
    const valid = await bcrypt.compare(code, challenge.codeHash);
    if (!valid) {
      await db.update(phoneVerificationCodes).set({ attempts: sql`${phoneVerificationCodes.attempts} + 1` })
        .where(eq(phoneVerificationCodes.id, challenge.id));
      throw new Error('The verification code is incorrect.');
    }

    const userId = await db.transaction(async (tx: any) => {
      const [consumed] = await tx.update(phoneVerificationCodes).set({ consumedAt: new Date() }).where(and(
        eq(phoneVerificationCodes.id, challenge.id), isNull(phoneVerificationCodes.consumedAt),
      )).returning({ id: phoneVerificationCodes.id });
      if (!consumed) throw new Error('This verification code has already been used.');
      const [existing] = await tx.select({ id: users.id }).from(users).where(eq(users.phone, phone)).limit(1);
      if (existing) return existing.id;
      const name = String(body.name || '').trim().slice(0, 100) || `WhatsApp user ${phone.slice(-4)}`;
      const passwordHash = await bcrypt.hash(randomUUID(), 10);
      const [created] = await tx.insert(users).values({
        name, email: `phone-${phone.replace(/\D/g, '')}@phone.fleetflow.local`, passwordHash,
        role: 'renter', phone, avatar: name.split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase(),
      }).returning({ id: users.id });
      await tx.insert(userSettings).values({ userId: created.id });
      return created.id;
    });
    const user = await loadSessionUser(userId);
    const sessionToken = await createSession(user, request);
    return ok({ user, sessionToken });
  } catch (error) {
    return fail(error);
  }
}
