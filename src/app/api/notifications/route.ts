import { and, desc, eq, isNull, or } from 'drizzle-orm';
import { getDb } from '@/db';
import { notifications, userSettings } from '@/db/schema';
import { requireUser } from '@/lib/auth';
import { fail, ok } from '@/lib/http';
import { ensureInitialMaintenanceSchedule, syncMaintenanceNotifications } from '@/lib/maintenance';

function recipientCondition(user: { id: number; role: string; companyId: number | null }) {
  if (user.role === 'company' && user.companyId) {
    return or(eq(notifications.userId, user.id), eq(notifications.companyId, user.companyId));
  }
  return eq(notifications.userId, user.id);
}

export async function GET() {
  try {
    const user = await requireUser();
    const db = await getDb();
    if (user.role === 'company' && user.companyId) {
      await ensureInitialMaintenanceSchedule(db, user.companyId);
      await syncMaintenanceNotifications(db, user.companyId);
    }
    const recipient = recipientCondition(user);
    const [preferences] = await db.select().from(userSettings)
      .where(eq(userSettings.userId, user.id)).limit(1);
    if (preferences && !preferences.inAppNotifications) {
      return ok({ notifications: [], unreadCount: 0 });
    }
    const items = await db.select().from(notifications)
      .where(recipient)
      .orderBy(desc(notifications.createdAt), desc(notifications.id))
      .limit(40);
    const visibleItems = items.filter((item: any) => {
      if (item.type.startsWith('support')) return preferences?.messageNotifications !== false;
      if (item.type === 'billing_updated') return preferences?.billingNotifications !== false;
      if (item.type === 'rental_created' || item.type === 'rental_status' || item.type.startsWith('maintenance')) return preferences?.rentalNotifications !== false;
      return true;
    });
    return ok({
      notifications: visibleItems,
      unreadCount: visibleItems.filter((item: any) => !item.readAt).length,
    });
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireUser();
    const body = await request.json();
    const db = await getDb();
    const recipient = recipientCondition(user);
    const readAt = new Date();

    if (body.action === 'readAll') {
      await db.update(notifications).set({ readAt })
        .where(and(recipient, isNull(notifications.readAt)));
      return ok({ readAt });
    }

    const id = Number(body.id);
    if (!Number.isInteger(id)) throw new Error('Choose a valid notification.');
    const [notification] = await db.update(notifications).set({ readAt })
      .where(and(recipient, eq(notifications.id, id)))
      .returning();
    if (!notification) return ok({ error: 'Notification not found' }, 404);
    return ok({ notification });
  } catch (error) {
    return fail(error);
  }
}
