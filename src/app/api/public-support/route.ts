import { createHmac } from 'node:crypto';
import { and, desc, eq, gt } from 'drizzle-orm';
import { getDb } from '@/db';
import { publicSupportRequests } from '@/db/schema';
import { ok } from '@/lib/http';

const markets = ['saudi_arabia', 'yemen', 'other'] as const;
const topics = ['general', 'suggestion', 'inquiry', 'platform_issue', 'privacy', 'legal'] as const;

const clean = (value:unknown, max:number) => String(value || '').trim().replace(/\s+/g, ' ').slice(0, max);

export async function POST(request:Request) {
  try {
    let body:Record<string, unknown>;
    try {
      body = await request.json() as Record<string, unknown>;
    } catch {
      return ok({ error:'Submit a valid JSON request.' }, 400);
    }
    // A hidden field gives basic bot protection without adding friction for real visitors.
    if (body.website) return ok({ received:true, reference:'FF-WEB-RECEIVED' }, 202);

    const name = clean(body.name, 100);
    const email = clean(body.email, 160).toLowerCase();
    const phone = clean(body.phone, 40) || null;
    const subject = clean(body.subject, 140);
    const message = String(body.message || '').trim().slice(0, 4_000);
    const market = String(body.market || '') as typeof markets[number];
    const topic = String(body.topic || '') as typeof topics[number];
    if (name.length < 2) return ok({ error:'Enter your full name.' }, 400);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return ok({ error:'Enter a valid email address.' }, 400);
    if (!markets.includes(market)) return ok({ error:'Choose the market related to your message.' }, 400);
    if (!topics.includes(topic)) return ok({ error:'Choose a valid platform support topic.' }, 400);
    if (subject.length < 5) return ok({ error:'Add a subject of at least 5 characters.' }, 400);
    if (message.length < 20) return ok({ error:'Please provide at least 20 characters so our team can understand your request.' }, 400);
    if (body.consent !== true) return ok({ error:'Confirm that FleetFlow may use these details to respond to your request.' }, 400);

    const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
    const source = forwarded || request.headers.get('x-real-ip') || 'unknown';
    // Keep the rate-limit key pseudonymous; neither the raw address nor request headers are persisted.
    const sourceHash = createHmac(
      'sha256',
      process.env.PUBLIC_SUPPORT_HASH_SECRET || process.env.JWT_SECRET || 'fleetflow-public-support-development',
    ).update(source).digest('hex');
    const db = await getDb();
    const windowStart = new Date(Date.now() - 15 * 60_000);
    const recent = await db.select({ id:publicSupportRequests.id }).from(publicSupportRequests).where(and(
      eq(publicSupportRequests.sourceHash, sourceHash), gt(publicSupportRequests.createdAt, windowStart),
    )).orderBy(desc(publicSupportRequests.createdAt)).limit(4);
    if (recent.length >= 3) return ok({ error:'Too many requests. Please wait 15 minutes before trying again.' }, 429);

    const [saved] = await db.insert(publicSupportRequests).values({
      name, email, phone, market, topic, subject, message, sourceHash,
      consentAt:new Date(), status:'new',
    }).returning();
    const reference = `FF-WEB-${String(saved.id).padStart(6, '0')}`;

    const webhook = process.env.PLATFORM_SUPPORT_WEBHOOK_URL;
    if (webhook) {
      try {
        const payload = JSON.stringify({
          reference, recipient:process.env.PLATFORM_SUPPORT_EMAIL || 'support@fleetflow.app',
          name, email, phone, market, topic, subject, message, createdAt:saved.createdAt,
        });
        const webhookSecret = process.env.PLATFORM_SUPPORT_WEBHOOK_SECRET;
        const signature = webhookSecret
          ? `sha256=${createHmac('sha256', webhookSecret).update(payload).digest('hex')}`
          : null;
        const response = await fetch(webhook, {
          method:'POST', signal:AbortSignal.timeout(5_000),
          headers:{
            'Content-Type':'application/json',
            ...(signature ? { 'X-FleetFlow-Signature':signature } : {}),
          },
          body:payload,
        });
        if (!response.ok) throw new Error(`Webhook responded with ${response.status}`);
      } catch (error) {
        console.error('Public support webhook delivery failed; request remains stored', error);
      }
    }
    return ok({ received:true, reference }, 201);
  } catch (error) {
    console.error('Public support request could not be stored', error);
    return ok({ error:'The request could not be submitted right now. Please try again later.' }, 500);
  }
}
