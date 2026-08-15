import { and, eq, inArray } from 'drizzle-orm';
import { getDb } from '@/db';
import { notifications, premiumServices, rentals, rentalServices, vehicles } from '@/db/schema';
import { requireUser } from '@/lib/auth';
import { fail, ok } from '@/lib/http';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const body = await request.json();
    const db = await getDb();
    const [row] = await db.select({ rental: rentals, companyId: vehicles.companyId })
      .from(rentals).innerJoin(vehicles, eq(rentals.vehicleId, vehicles.id))
      .where(eq(rentals.id, Number(id))).limit(1);
    if (!row) return ok({ error: 'Rental not found' }, 404);
    const rental = row.rental;

    if (body.action === 'updateBilling') {
      if (user.role !== 'company' || row.companyId !== user.companyId) throw new Error('Only the company administrator can adjust billing.');
      if (rental.status === 'cancelled') throw new Error('A cancelled rental bill cannot be adjusted.');
      const requested = Array.isArray(body.services) ? body.services.filter((item: any) => Number(item.days) > 0) : [];
      const serviceIds = [...new Set(requested.map((item: any) => Number(item.serviceId)).filter(Boolean))] as number[];
      const catalog = serviceIds.length ? await db.select().from(premiumServices).where(inArray(premiumServices.id, serviceIds)) : [];
      const lines = requested.map((item: any) => {
        const service = catalog.find((entry: any) => entry.id === Number(item.serviceId));
        if (!service || service.companyId !== user.companyId) throw new Error('A premium service does not belong to this company.');
        const days = Math.max(1, Math.floor(Number(item.days)));
        const unitPrice = Math.max(0, Number(item.unitPrice));
        const subtotal = unitPrice * days;
        const discount = Math.max(0, Math.min(subtotal, Number(item.discount || 0)));
        return { service, days, unitPrice, subtotal, discount };
      });
      const extrasSubtotal = lines.reduce((sum: number, line: any) => sum + line.subtotal - line.discount, 0);
      const maximumExtraDiscount = Math.max(0, rental.subtotal - rental.discount + extrasSubtotal);
      const extraDiscount = Math.max(0, Math.min(maximumExtraDiscount, Number(body.extraDiscount || 0)));
      const total = Math.max(0, rental.subtotal - rental.discount + extrasSubtotal - extraDiscount);

      await db.delete(rentalServices).where(eq(rentalServices.rentalId, rental.id));
      let savedServices: any[] = [];
      if (lines.length) {
        savedServices = await db.insert(rentalServices).values(lines.map((line: any) => ({
          rentalId: rental.id, serviceId: line.service.id, name: line.service.name,
          unitPrice: line.unitPrice, days: line.days, discount: line.discount, subtotal: line.subtotal,
        }))).returning();
      }
      const [updated] = await db.update(rentals).set({ extrasSubtotal, extraDiscount, total })
        .where(eq(rentals.id, rental.id)).returning();
      await db.insert(notifications).values({
        userId: rental.renterId,
        type: 'billing_updated',
        body: `FF-${String(rental.id).padStart(4, '0')}`,
        href: `/invoice/${rental.id}?token=${encodeURIComponent(rental.invoiceToken)}`,
        entityType: 'rental',
        entityId: rental.id,
        dedupeKey: `billing-updated-${rental.id}-${Date.now()}`,
      });
      return ok({ rental: { ...updated, services: savedServices } });
    }

    let status: typeof rental.status;
    if (user.role === 'company') {
      if (row.companyId !== user.companyId) throw new Error('You cannot manage this rental.');
      if (body.action === 'confirm' && rental.status === 'pending') status = 'active';
      else if (body.action === 'complete' && rental.status === 'active') status = 'completed';
      else if (body.action === 'cancel' && ['pending', 'active'].includes(rental.status)) status = 'cancelled';
      else throw new Error('This status transition is not allowed.');
    } else {
      if (rental.renterId !== user.id || body.action !== 'cancel' || !['pending', 'active'].includes(rental.status)) {
        throw new Error('This rental cannot be cancelled.');
      }
      status = 'cancelled';
    }
    const [updated] = await db.update(rentals).set({ status })
      .where(and(eq(rentals.id, rental.id), eq(rentals.status, rental.status))).returning();
    if (!updated) throw new Error('The rental was updated elsewhere. Refresh and try again.');
    await db.insert(notifications).values({
      ...(user.role === 'company' ? { userId: rental.renterId } : { companyId: row.companyId }),
      type: 'rental_status',
      body: `FF-${String(rental.id).padStart(4, '0')} · ${status}`,
      href: '/dashboard/rentals',
      entityType: 'rental',
      entityId: rental.id,
      dedupeKey: `rental-status-${rental.id}-${status}-${Date.now()}`,
    });
    const services = await db.select().from(rentalServices).where(eq(rentalServices.rentalId, rental.id));
    return ok({ rental: { ...updated, services } });
  } catch (error) { return fail(error); }
}
