import { and, desc, eq, inArray } from 'drizzle-orm';
import { getDb } from '@/db';
import { maintenanceItems, maintenanceWorkOrders, rentals, vehicles } from '@/db/schema';
import { requireUser } from '@/lib/auth';
import { fail, ok } from '@/lib/http';
import { ensureInitialMaintenanceSchedule, ensureMaintenanceCatalog, findMaintenanceRentalConflict, syncMaintenanceNotifications } from '@/lib/maintenance';

export async function GET() {
  try {
    const user = await requireUser('company');
    const db = await getDb();
    const catalog = await ensureMaintenanceCatalog(db, user.companyId!);
    await ensureInitialMaintenanceSchedule(db, user.companyId!);
    await syncMaintenanceNotifications(db, user.companyId!);
    const vehicleRows = await db.select({
      id: vehicles.id,
      make: vehicles.make,
      model: vehicles.model,
      year: vehicles.year,
      licensePlate: vehicles.licensePlate,
      odometer: vehicles.odometer,
      image: vehicles.image,
      status: vehicles.status,
    }).from(vehicles).where(eq(vehicles.companyId, user.companyId!));
    const rows = await db.select({
      order: maintenanceWorkOrders,
      make: vehicles.make,
      model: vehicles.model,
      year: vehicles.year,
      licensePlate: vehicles.licensePlate,
      image: vehicles.image,
      odometer: vehicles.odometer,
      itemName: maintenanceItems.name,
    }).from(maintenanceWorkOrders)
      .innerJoin(vehicles, eq(maintenanceWorkOrders.vehicleId, vehicles.id))
      .leftJoin(maintenanceItems, eq(maintenanceWorkOrders.itemId, maintenanceItems.id))
      .where(eq(maintenanceWorkOrders.companyId, user.companyId!))
      .orderBy(desc(maintenanceWorkOrders.updatedAt));
    const vehicleIds = vehicleRows.map((vehicle: any) => vehicle.id);
    const reservationRows = vehicleIds.length ? await db.select({
      id: rentals.id,
      vehicleId: rentals.vehicleId,
      startsAt: rentals.startsAt,
      endsAt: rentals.endsAt,
      status: rentals.status,
    }).from(rentals).where(and(
      inArray(rentals.vehicleId, vehicleIds),
      inArray(rentals.status, ['pending', 'active']),
    )) : [];
    const workOrders = rows.map((row: any) => {
      const { waybillData: _waybillData, ...order } = row.order;
      return {
        ...order,
        make: row.make,
        model: row.model,
        year: row.year,
        licensePlate: row.licensePlate,
        image: row.image,
        odometer: row.odometer,
        itemName: row.itemName,
        hasWaybill: Boolean(row.order.waybillData),
        conflict: ['scheduled', 'in_progress'].includes(row.order.status)
          ? findMaintenanceRentalConflict(row.order, reservationRows)
          : null,
      };
    });
    const now = new Date();
    const soon = new Date(now.getTime() + 30 * 86_400_000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    return ok({
      catalog,
      vehicles: vehicleRows,
      workOrders,
      metrics: {
        scheduled: workOrders.filter((order: any) => order.status === 'scheduled').length,
        dueSoon: workOrders.filter((order: any) => ['scheduled', 'in_progress'].includes(order.status) && (
          new Date(order.dueAt) <= soon || (order.dueOdometer && Number(order.dueOdometer) - Number(order.odometer) <= 1_000)
        )).length,
        overdue: workOrders.filter((order: any) => ['scheduled', 'in_progress'].includes(order.status) && (
          new Date(order.dueAt) < now || (order.dueOdometer && Number(order.odometer) >= Number(order.dueOdometer))
        )).length,
        conflicts: workOrders.filter((order: any) => order.conflict).length,
        monthCost: workOrders.filter((order: any) => order.status === 'completed' && order.completedAt && new Date(order.completedAt) >= monthStart)
          .reduce((sum: number, order: any) => sum + Number(order.cost || 0), 0),
      },
    });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser('company');
    const body = await request.json();
    const db = await getDb();
    const vehicleId = Number(body.vehicleId);
    const itemId = Number(body.itemId);
    const [vehicle] = await db.select().from(vehicles)
      .where(and(eq(vehicles.id, vehicleId), eq(vehicles.companyId, user.companyId!))).limit(1);
    if (!vehicle) throw new Error('Choose a vehicle from your fleet.');
    const [item] = await db.select().from(maintenanceItems)
      .where(and(eq(maintenanceItems.id, itemId), eq(maintenanceItems.companyId, user.companyId!))).limit(1);
    if (!item) throw new Error('Choose a valid maintenance item.');
    const dueAt = new Date(body.dueAt);
    const scheduledAt = new Date(body.scheduledAt);
    const durationHours = Math.max(0.5, Math.min(72, Number(body.durationHours || item.defaultDurationHours || 1)));
    if (Number.isNaN(dueAt.getTime()) || Number.isNaN(scheduledAt.getTime())) throw new Error('Choose valid due and workshop dates.');
    const priority = ['routine', 'soon', 'urgent'].includes(body.priority) ? body.priority : 'routine';
    const draft = {
      vehicleId,
      dueAt,
      scheduledAt,
      durationHours,
    };
    const reservationRows = await db.select({
      id: rentals.id,
      vehicleId: rentals.vehicleId,
      startsAt: rentals.startsAt,
      endsAt: rentals.endsAt,
      status: rentals.status,
    }).from(rentals).where(and(
      eq(rentals.vehicleId, vehicleId),
      inArray(rentals.status, ['pending', 'active']),
    ));
    const conflict = findMaintenanceRentalConflict(draft, reservationRows);
    if (conflict) {
      return ok({
        error: conflict.kind === 'active_rental'
          ? 'This vehicle is currently rented. Schedule maintenance immediately after its protected return window.'
          : 'Maintenance must finish before the reservation and its protected turnaround window.',
        code: 'MAINTENANCE_RENTAL_CONFLICT',
        conflict,
      }, 409);
    }
    const [workOrder] = await db.insert(maintenanceWorkOrders).values({
      companyId: user.companyId!,
      vehicleId,
      itemId: item.id,
      title: String(body.title || item.name).trim().slice(0, 140),
      description: String(body.description || item.description).trim(),
      status: 'scheduled',
      priority,
      dueAt,
      dueOdometer: body.dueOdometer ? Math.max(0, Number(body.dueOdometer)) : null,
      scheduledAt,
      durationHours,
      vendor: String(body.vendor || '').trim() || null,
      notes: String(body.notes || '').trim() || null,
      recurrenceDays: body.recurrenceDays === null ? null : Math.max(0, Number(body.recurrenceDays ?? item.intervalDays) || 0) || null,
      recurrenceKm: body.recurrenceKm === null ? null : Math.max(0, Number(body.recurrenceKm ?? item.intervalKm) || 0) || null,
    }).returning();
    await syncMaintenanceNotifications(db, user.companyId!);
    return ok({ workOrder }, 201);
  } catch (error) {
    return fail(error);
  }
}
