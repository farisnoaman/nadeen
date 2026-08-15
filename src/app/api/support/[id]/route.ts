import { and, asc, eq, inArray, isNull, or } from 'drizzle-orm';
import { getDb } from '@/db';
import { companies, notifications, supportMessages, supportTickets, users } from '@/db/schema';
import { requireUser } from '@/lib/auth';
import { fail, ok } from '@/lib/http';

function ticketAccess(user: { id: number; role: string; companyId: number | null }) {
  if (user.role === 'company' && user.companyId) {
    return or(eq(supportTickets.userId, user.id), eq(supportTickets.companyId, user.companyId));
  }
  return eq(supportTickets.userId, user.id);
}

function notificationRecipient(user: { id: number; role: string; companyId: number | null }) {
  if (user.role === 'company' && user.companyId) {
    return or(eq(notifications.userId, user.id), eq(notifications.companyId, user.companyId));
  }
  return eq(notifications.userId, user.id);
}

async function ownedTicket(db: any, id: number, user: { id: number; role: string; companyId: number | null }) {
  const [row] = await db.select({
    ticket: supportTickets,
    requesterName: users.name,
    companyName: companies.name,
  }).from(supportTickets)
    .innerJoin(users, eq(supportTickets.userId, users.id))
    .leftJoin(companies, eq(supportTickets.companyId, companies.id))
    .where(and(eq(supportTickets.id, id), ticketAccess(user)))
    .limit(1);
  return row ? { ...row.ticket, requesterName: row.requesterName, companyName: row.companyName } : null;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id: idParam } = await params;
    const id = Number(idParam);
    if (!Number.isInteger(id)) return ok({ error: 'Conversation not found' }, 404);
    const db = await getDb();
    const ticket = await ownedTicket(db, id, user);
    if (!ticket) return ok({ error: 'Conversation not found' }, 404);

    const readAt = new Date();
    const isRequester = ticket.userId === user.id;
    const incomingTypes = isRequester ? ['company', 'support'] as const : ['customer'] as const;
    await db.update(supportMessages).set({ readAt })
      .where(and(
        eq(supportMessages.ticketId, ticket.id),
        inArray(supportMessages.senderType, incomingTypes),
        isNull(supportMessages.readAt),
      ));
    await db.update(notifications).set({ readAt })
      .where(and(
        notificationRecipient(user),
        eq(notifications.entityType, 'support_ticket'),
        eq(notifications.entityId, ticket.id),
        isNull(notifications.readAt),
      ));
    const messages = await db.select().from(supportMessages)
      .where(eq(supportMessages.ticketId, ticket.id))
      .orderBy(asc(supportMessages.createdAt), asc(supportMessages.id));
    return ok({ ticket, messages });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id: idParam } = await params;
    const id = Number(idParam);
    const body = await request.json();
    const messageBody = String(body.message || '').trim();
    if (messageBody.length < 1 || messageBody.length > 2_000) {
      throw new Error('Your message must be between 1 and 2,000 characters.');
    }

    const db = await getDb();
    const ticket = await ownedTicket(db, id, user);
    if (!ticket) return ok({ error: 'Conversation not found' }, 404);
    const companyIsReplying = user.role === 'company'
      && !!user.companyId
      && ticket.companyId === user.companyId
      && ticket.userId !== user.id;
    const now = new Date();
    const [message] = await db.insert(supportMessages).values({
      ticketId: ticket.id,
      senderType: companyIsReplying ? 'company' : 'customer',
      senderUserId: user.id,
      body: messageBody,
      createdAt: now,
    }).returning();
    const status = companyIsReplying ? 'waiting' : 'open';
    const [updatedTicket] = await db.update(supportTickets).set({ status, updatedAt: now })
      .where(eq(supportTickets.id, ticket.id)).returning();

    if (companyIsReplying) {
      await db.insert(notifications).values({
        userId: ticket.userId,
        type: 'support_reply',
        body: `${ticket.companyName || user.companyName || 'Rental company'} · ${ticket.subject}`,
        href: `/dashboard/support?conversation=${ticket.id}`,
        entityType: 'support_ticket',
        entityId: ticket.id,
        dedupeKey: `support-reply-${message.id}`,
        createdAt: now,
      });
    } else if (ticket.companyId) {
      await db.insert(notifications).values({
        companyId: ticket.companyId,
        type: 'support_message',
        body: `${ticket.requesterName} · ${ticket.subject}`,
        href: `/dashboard/support?conversation=${ticket.id}`,
        entityType: 'support_ticket',
        entityId: ticket.id,
        dedupeKey: `support-message-${message.id}`,
        createdAt: now,
      });
    }

    return ok({
      message,
      ticket: { ...updatedTicket, requesterName: ticket.requesterName, companyName: ticket.companyName },
    }, 201);
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id: idParam } = await params;
    const id = Number(idParam);
    const body = await request.json();
    if (!['open', 'resolved'].includes(body.status)) throw new Error('Choose a valid conversation status.');

    const db = await getDb();
    const ticket = await ownedTicket(db, id, user);
    if (!ticket) return ok({ error: 'Conversation not found' }, 404);
    const now = new Date();
    const [updatedTicket] = await db.update(supportTickets)
      .set({ status: body.status, updatedAt: now })
      .where(eq(supportTickets.id, ticket.id))
      .returning();
    const companyIsActing = user.role === 'company'
      && !!user.companyId
      && ticket.companyId === user.companyId
      && ticket.userId !== user.id;
    const notification = companyIsActing
      ? { userId: ticket.userId, companyId: null }
      : ticket.companyId
        ? { userId: null, companyId: ticket.companyId }
        : null;
    if (notification) {
      await db.insert(notifications).values({
        ...notification,
        type: 'support_status',
        body: `${body.status} · ${ticket.subject}`,
        href: `/dashboard/support?conversation=${ticket.id}`,
        entityType: 'support_ticket',
        entityId: ticket.id,
        dedupeKey: `support-status-${ticket.id}-${body.status}-${now.getTime()}`,
        createdAt: now,
      });
    }
    return ok({
      ticket: { ...updatedTicket, requesterName: ticket.requesterName, companyName: ticket.companyName },
    });
  } catch (error) {
    return fail(error);
  }
}
