import { and, eq, inArray } from 'drizzle-orm';
import { getDb } from '@/db';
import { maintenanceItems, maintenanceWorkOrders, rentals, vehicles } from '@/db/schema';
import { requireUser } from '@/lib/auth';
import { fail, ok } from '@/lib/http';
import { findMaintenanceRentalConflict, syncMaintenanceNotifications } from '@/lib/maintenance';

async function loadOwnedOrder(db: any, id: number, companyId: number) {
  const [order] = await db.select().from(maintenanceWorkOrders)
    .where(and(eq(maintenanceWorkOrders.id, id), eq(maintenanceWorkOrders.companyId, companyId)))
    .limit(1);
  return order;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser('company');
    const { id: idValue } = await params;
    const id = Number(idValue);
    const body = await request.json();
    const db = await getDb();
    const order = await loadOwnedOrder(db, id, user.companyId!);
    if (!order) return ok({ error: 'Maintenance work order not found' }, 404);
    const now = new Date();

    if (body.action === 'reschedule') {
      if (!['scheduled', 'in_progress'].includes(order.status)) throw new Error('Completed maintenance cannot be rescheduled.');
      const dueAt = new Date(body.dueAt || order.dueAt);
      const scheduledAt = new Date(body.scheduledAt || order.scheduledAt);
      const durationHours = Math.max(0.5, Math.min(72, Number(body.durationHours || order.durationHours)));
      if (Number.isNaN(dueAt.getTime()) || Number.isNaN(scheduledAt.getTime())) throw new Error('Choose valid maintenance dates.');
      const reservationRows = await db.select({
        id: rentals.id,
        vehicleId: rentals.vehicleId,
        startsAt: rentals.startsAt,
        endsAt: rentals.endsAt,
        status: rentals.status,
      }).from(rentals).where(and(
        eq(rentals.vehicleId, order.vehicleId),
        inArray(rentals.status, ['pending', 'active']),
      ));
      const conflict = findMaintenanceRentalConflict({ ...order, dueAt, scheduledAt, durationHours }, reservationRows);
      if (conflict) return ok({
        error: conflict.kind === 'active_rental'
          ? 'This vehicle is currently rented. Schedule maintenance after its protected return window.'
          : 'The workshop window conflicts with a reservation. Finish maintenance before the protected pickup window.',
        code: 'MAINTENANCE_RENTAL_CONFLICT',
        conflict,
      }, 409);
      const [updated] = await db.update(maintenanceWorkOrders).set({
        dueAt,
        scheduledAt,
        durationHours,
        dueOdometer: body.dueOdometer === '' ? null : Number(body.dueOdometer ?? order.dueOdometer) || null,
        priority: ['routine', 'soon', 'urgent'].includes(body.priority) ? body.priority : order.priority,
        vendor: body.vendor === undefined ? order.vendor : String(body.vendor).trim() || null,
        notes: body.notes === undefined ? order.notes : String(body.notes).trim() || null,
        updatedAt: now,
      }).where(eq(maintenanceWorkOrders.id, order.id)).returning();
      await syncMaintenanceNotifications(db, user.companyId!);
      return ok({ workOrder: updated });
    }

    if (body.action === 'start') {
      if (order.status !== 'scheduled') throw new Error('Only scheduled maintenance can be started.');
      const activeRentals = await db.select().from(rentals).where(and(
        eq(rentals.vehicleId, order.vehicleId),
        eq(rentals.status, 'active'),
      ));
      const activeRental = activeRentals.find((rental: any) => new Date(rental.startsAt) <= now && new Date(rental.endsAt) > now);
      if (activeRental) return ok({
        error: 'The vehicle is in an active rental. Maintenance can start only after return and the protected turnaround window.',
        code: 'ACTIVE_RENTAL_MAINTENANCE_BLOCK',
        rentalId: activeRental.id,
        availableAfter: new Date(new Date(activeRental.endsAt).getTime() + 3_600_000),
      }, 409);
      const [updated] = await db.update(maintenanceWorkOrders).set({ status: 'in_progress', updatedAt: now })
        .where(eq(maintenanceWorkOrders.id, order.id)).returning();
      await db.update(vehicles).set({ status: 'maintenance' }).where(eq(vehicles.id, order.vehicleId));
      return ok({ workOrder: updated });
    }

    if (body.action === 'complete') {
      if (!['scheduled', 'in_progress'].includes(order.status)) throw new Error('This work order cannot be completed.');
      const [vehicle] = await db.select().from(vehicles).where(eq(vehicles.id, order.vehicleId)).limit(1);
      const completedAt = body.completedAt ? new Date(body.completedAt) : now;
      const completedOdometer = Math.max(0, Number(body.completedOdometer ?? vehicle?.odometer ?? 0));
      const cost = Math.max(0, Number(body.cost || 0));
      if (Number.isNaN(completedAt.getTime())) throw new Error('Choose a valid completion date.');
      const [updated] = await db.update(maintenanceWorkOrders).set({
        status: 'completed',
        completedAt,
        completedOdometer,
        cost,
        vendor: String(body.vendor ?? order.vendor ?? '').trim() || null,
        notes: String(body.notes ?? order.notes ?? '').trim() || null,
        updatedAt: now,
      }).where(eq(maintenanceWorkOrders.id, order.id)).returning();
      if (vehicle) {
        await db.update(vehicles).set({
          odometer: Math.max(vehicle.odometer, completedOdometer),
          status: vehicle.status === 'retired' ? 'retired' : 'available',
        }).where(eq(vehicles.id, vehicle.id));
      }
      let nextWorkOrder = null;
      if (order.itemId && (order.recurrenceDays || order.recurrenceKm)) {
        const [item] = await db.select().from(maintenanceItems).where(eq(maintenanceItems.id, order.itemId)).limit(1);
        const nextDueAt = new Date(completedAt);
        nextDueAt.setDate(nextDueAt.getDate() + Number(order.recurrenceDays || 365));
        const nextScheduledAt = new Date(nextDueAt.getTime() - 7 * 86_400_000);
        [nextWorkOrder] = await db.insert(maintenanceWorkOrders).values({
          companyId: order.companyId,
          vehicleId: order.vehicleId,
          itemId: order.itemId,
          title: order.title,
          description: order.description,
          status: 'scheduled',
          priority: 'routine',
          dueAt: nextDueAt,
          dueOdometer: order.recurrenceKm ? completedOdometer + order.recurrenceKm : null,
          scheduledAt: nextScheduledAt,
          durationHours: order.durationHours,
          recurrenceDays: order.recurrenceDays,
          recurrenceKm: order.recurrenceKm,
          vendor: order.vendor,
          notes: item ? `Automatically scheduled from completed ${item.name}.` : 'Automatically scheduled recurring maintenance.',
        }).returning();
      }
      await syncMaintenanceNotifications(db, user.companyId!);
      return ok({ workOrder: updated, nextWorkOrder });
    }

    if (body.action === 'cancel') {
      if (order.status === 'completed') throw new Error('Completed maintenance cannot be cancelled.');
      const [updated] = await db.update(maintenanceWorkOrders).set({ status: 'cancelled', updatedAt: now })
        .where(eq(maintenanceWorkOrders.id, order.id)).returning();
      if (order.status === 'in_progress') {
        const [vehicle] = await db.select().from(vehicles).where(eq(vehicles.id, order.vehicleId)).limit(1);
        if (vehicle?.status === 'maintenance') await db.update(vehicles).set({ status: 'available' }).where(eq(vehicles.id, order.vehicleId));
      }
      return ok({ workOrder: updated });
    }

    if (body.action === 'attachWaybill') {
      const file = body.file || {};
      const name = String(file.name || '').slice(0, 180);
      const mime = String(file.mime || '');
      const data = String(file.data || '');
      if (!name || !['application/pdf', 'image/png', 'image/jpeg', 'image/webp'].includes(mime)) {
        throw new Error('Attach a PDF, PNG, JPEG, or WebP waybill.');
      }
      const size = Buffer.from(data, 'base64').byteLength;
      if (!size || size > 5 * 1024 * 1024) throw new Error('The waybill must be smaller than 5 MB.');
      const [updated] = await db.update(maintenanceWorkOrders).set({
        waybillName: name,
        waybillMime: mime,
        waybillData: data,
        updatedAt: now,
      }).where(eq(maintenanceWorkOrders.id, order.id)).returning();
      const { waybillData: _data, ...safe } = updated;
      return ok({ workOrder: { ...safe, hasWaybill: true } });
    }

    if (body.action === 'removeWaybill') {
      const [updated] = await db.update(maintenanceWorkOrders).set({
        waybillName: null,
        waybillMime: null,
        waybillData: null,
        updatedAt: now,
      }).where(eq(maintenanceWorkOrders.id, order.id)).returning();
      const { waybillData: _data, ...safe } = updated;
      return ok({ workOrder: { ...safe, hasWaybill: false } });
    }

    throw new Error('Choose a valid maintenance action.');
  } catch (error) {
    return fail(error);
  }
}
