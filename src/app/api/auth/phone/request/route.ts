import { randomInt } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { and, desc, eq, gt, lt } from 'drizzle-orm';
import { getDb } from '@/db';
import { phoneVerificationCodes } from '@/db/schema';
import { fail, ok } from '@/lib/http';
import { normalizePhoneNumber, sendWhatsAppVerification } from '@/lib/phone-auth';

export async function POST(request: Request) {
  try {
    const { phone: input } = await request.json();
    const phone = normalizePhoneNumber(input);
    const db = await getDb();
    const rateLimitSeconds = Math.max(30, Number(process.env.OTP_RATE_LIMIT_SECONDS) || 60);
    const ttlSeconds = Math.max(60, Number(process.env.OTP_TTL_SECONDS) || 300);
    const oneMinuteAgo = new Date(Date.now() - rateLimitSeconds * 1000);
    await db.delete(phoneVerificationCodes).where(lt(phoneVerificationCodes.expiresAt, new Date(Date.now() - 24 * 60 * 60_000)));
    const [recent] = await db.select({ id: phoneVerificationCodes.id }).from(phoneVerificationCodes)
      .where(and(eq(phoneVerificationCodes.phone, phone), gt(phoneVerificationCodes.createdAt, oneMinuteAgo)))
      .orderBy(desc(phoneVerificationCodes.createdAt)).limit(1);
    if (recent) throw new Error('Please wait before requesting another verification code.');

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const codeHash = await bcrypt.hash(code, 10);
    await db.insert(phoneVerificationCodes).values({
      phone, codeHash, expiresAt: new Date(Date.now() + ttlSeconds * 1000),
    });
    const delivered = await sendWhatsAppVerification(phone, code);
    const demoModeEnabled = ['1', 'true'].includes(String(process.env.OTP_DEMO_MODE || '').toLowerCase());
    const localDemo = !delivered && (demoModeEnabled || (process.env.NODE_ENV !== 'production' && !process.env.DATABASE_URL));
    if (!delivered && !localDemo) throw new Error('WhatsApp sign-in is not configured. Contact the platform administrator.');
    return ok({ sent: true, phone, expiresInSeconds: ttlSeconds, ...(localDemo ? { demoCode: code } : {}) });
  } catch (error) {
    return fail(error);
  }
}
