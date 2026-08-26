import { desc, eq, inArray, or } from 'drizzle-orm';
import { getDb } from '@/db';
import {
  companies,
  notifications,
  rentals,
  supportMessages,
  supportTickets,
  users,
  vehicles,
} from '@/db/schema';
import { requireUser } from '@/lib/auth';
import { fail, ok } from '@/lib/http';

const categories = ['booking', 'billing', 'vehicle', 'account', 'technical', 'other'] as const;
const priorities = ['normal', 'urgent'] as const;

export async function GET() {
  try {
    const user = await requireUser(undefined,{allowUnverifiedCompany:true});
    const db = await getDb();
    const access = user.role === 'company' && user.companyId
      ? or(eq(supportTickets.userId, user.id), eq(supportTickets.companyId, user.companyId))
      : eq(supportTickets.userId, user.id);
    const ticketRows = await db.select({
      ticket: supportTickets,
      requesterName: users.name,
      companyName: companies.name,
    }).from(supportTickets)
      .innerJoin(users, eq(supportTickets.userId, users.id))
      .leftJoin(companies, eq(supportTickets.companyId, companies.id))
      .where(access)
      .orderBy(desc(supportTickets.updatedAt));
    const ids = ticketRows.map((row: any) => row.ticket.id);
    const messages = ids.length
      ? await db.select().from(supportMessages)
        .where(inArray(supportMessages.ticketId, ids))
        .orderBy(desc(supportMessages.createdAt), desc(supportMessages.id))
      : [];

    return ok({
      tickets: ticketRows.map((row: any) => {
        const ticket = row.ticket;
        const ticketMessages = messages.filter((message: any) => message.ticketId === ticket.id);
        const lastMessage = ticketMessages[0];
        const isRequester = ticket.userId === user.id;
        return {
          ...ticket,
          requesterName: row.requesterName,
          companyName: row.companyName,
          lastMessage: lastMessage?.body || '',
          lastMessageAt: lastMessage?.createdAt || ticket.updatedAt,
          unreadCount: ticketMessages.filter((message: any) => {
            if (message.readAt) return false;
            return isRequester ? message.senderType !== 'customer' : message.senderType === 'customer';
          }).length,
        };
      }),
    });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser(undefined,{allowUnverifiedCompany:true});
    const body = await request.json();
    const subject = String(body.subject || '').trim();
    const messageBody = String(body.message || '').trim();
    const category = String(body.category || 'other') as typeof categories[number];
    const priority = String(body.priority || 'normal') as typeof priorities[number];
    const rentalId = body.rentalId ? Number(body.rentalId) : null;

    if (subject.length < 4 || subject.length > 120) throw new Error('Add a subject between 4 and 120 characters.');
    if (messageBody.length < 2 || messageBody.length > 2_000) throw new Error('Your message must be between 2 and 2,000 characters.');
    if (!categories.includes(category)) throw new Error('Choose a valid support category.');
    if (!priorities.includes(priority)) throw new Error('Choose a valid priority.');

    const db = await getDb();
    let recipientCompanyId: number | null = null;
    let recipientCompanyName: string | null = null;
    if (rentalId) {
      const [linkedRental] = await db.select({
        renterId: rentals.renterId,
        companyId: vehicles.companyId,
        companyName: companies.name,
      }).from(rentals)
        .innerJoin(vehicles, eq(rentals.vehicleId, vehicles.id))
        .innerJoin(companies, eq(vehicles.companyId, companies.id))
        .where(eq(rentals.id, rentalId))
        .limit(1);
      const canLink = linkedRental && (
        (user.role === 'renter' && linkedRental.renterId === user.id)
        || (user.role === 'company' && linkedRental.companyId === user.companyId)
      );
      if (!canLink) throw new Error('The selected rental cannot be linked to this conversation.');
      if (user.role === 'renter') {
        recipientCompanyId = linkedRental.companyId;
        recipientCompanyName = linkedRental.companyName;
      }
    }

    const now = new Date();
    const [ticket] = await db.insert(supportTickets).values({
      userId: user.id,
      companyId: recipientCompanyId,
      rentalId,
      subject,
      category,
      priority,
      status: 'open',
      createdAt: now,
      updatedAt: now,
    }).returning();
    const acknowledgement = recipientCompanyId
      ? body.lang === 'ar'
        ? `تم إرسال رسالتك إلى ${recipientCompanyName}. سنرسل إليك إشعاراً عند رد الشركة داخل هذه المحادثة.`
        : `Your message was delivered to ${recipientCompanyName}. We will notify you when the company replies in this conversation.`
      : body.lang === 'ar'
        ? 'تم استلام رسالتك بأمان. سيتابع أحد مختصي دعم فليت فلو معك داخل هذه المحادثة. يمكنك إضافة أي تفاصيل أخرى هنا في أي وقت.'
        : 'Your message was received securely. A FleetFlow support specialist will follow up in this conversation. You can add more details here at any time.';
    const [customerMessage, systemMessage] = await db.insert(supportMessages).values([
      {
        ticketId: ticket.id,
        senderType: 'customer',
        senderUserId: user.id,
        body: messageBody,
        createdAt: now,
      },
      {
        ticketId: ticket.id,
        senderType: 'support',
        body: acknowledgement,
        automated: true,
        createdAt: new Date(now.getTime() + 1),
      },
    ]).returning();

    if (recipientCompanyId) {
      await db.insert(notifications).values({
        companyId: recipientCompanyId,
        type: 'support_message',
        body: `${user.name} · ${subject}`,
        href: `/dashboard/support?conversation=${ticket.id}`,
        entityType: 'support_ticket',
        entityId: ticket.id,
        dedupeKey: `support-message-${customerMessage.id}`,
        createdAt: now,
      });
    }

    return ok({
      ticket: { ...ticket, requesterName: user.name, companyName: recipientCompanyName },
      messages: [customerMessage, systemMessage],
    }, 201);
  } catch (error) {
    return fail(error);
  }
}
