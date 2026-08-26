import { and, eq, inArray, isNull } from 'drizzle-orm';
import { getDb } from '@/db';
import { loyaltyPointLedger, notifications, premiumServices, rentals, rentalServices, vehicleConditionLogs, vehicles } from '@/db/schema';
import { requireUser } from '@/lib/auth';
import { fail, ok } from '@/lib/http';
import { pointsForCompletedRental } from '@/lib/loyalty';
import { roundMoney } from '@/lib/rental-document';
import { canonicalOdometer } from '@/lib/telemetry';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const body = await request.json();
    const db = await getDb();
    const [row] = await db.select({
      rental: rentals, companyId: vehicles.companyId, vehicleOdometer: vehicles.odometer,
      vehicleFuelLevel: vehicles.fuelLevel, vehicleId: vehicles.id,
    }).from(rentals).innerJoin(vehicles, eq(rentals.vehicleId, vehicles.id))
      .where(eq(rentals.id, Number(id))).limit(1);
    if (!row) return ok({ error: 'Rental not found' }, 404);
    const rental = row.rental;
    const recordedReadings = await db.select().from(vehicleConditionLogs)
      .where(eq(vehicleConditionLogs.vehicleId, row.vehicleId));
    const latestSystemOdometer = canonicalOdometer(row.vehicleOdometer, recordedReadings);

    if (body.action === 'updateBilling') {
      if (user.role !== 'company' || row.companyId !== user.companyId) throw new Error('Only the company administrator can adjust billing.');
      if (rental.status === 'cancelled') throw new Error('A cancelled rental bill cannot be adjusted.');
      if (rental.status === 'completed' || rental.paidAt) throw new Error('A paid final waybill cannot be adjusted.');
      const requested = Array.isArray(body.services) ? body.services.filter((item: any) => Number(item.days) > 0) : [];
      const serviceIds = [...new Set(requested.map((item: any) => Number(item.serviceId)).filter(Boolean))] as number[];
      const catalog = serviceIds.length ? await db.select().from(premiumServices).where(inArray(premiumServices.id, serviceIds)) : [];
      const lines = requested.map((item: any) => {
        const service = catalog.find((entry: any) => entry.id === Number(item.serviceId));
        if (!service || service.companyId !== user.companyId) throw new Error('A premium service does not belong to this company.');
        const days = Math.max(1, Math.floor(Number(item.days)));
        const unitPrice = Math.max(0, Number(item.unitPrice));
        const subtotal = roundMoney(unitPrice * days);
        const discount = roundMoney(Math.max(0, Math.min(subtotal, Number(item.discount || 0))));
        return { service, days, unitPrice:roundMoney(unitPrice), subtotal, discount };
      });
      const extrasSubtotal = roundMoney(lines.reduce((sum: number, line: any) => sum + line.subtotal - line.discount, 0));
      const maximumExtraDiscount = roundMoney(Math.max(0, rental.subtotal - rental.discount - rental.loyaltyDiscount + extrasSubtotal + rental.protectionSubtotal + rental.fuelCharge + rental.excessDistanceCharge));
      const extraDiscount = roundMoney(Math.max(0, Math.min(maximumExtraDiscount, Number(body.extraDiscount || 0))));
      const total = roundMoney(Math.max(0, rental.subtotal - rental.discount - rental.loyaltyDiscount + extrasSubtotal + rental.protectionSubtotal + rental.fuelCharge + rental.excessDistanceCharge - extraDiscount));

      const saved = await db.transaction(async (tx:any) => {
        await tx.delete(rentalServices).where(eq(rentalServices.rentalId, rental.id));
        let savedServices: any[] = [];
        if (lines.length) {
          savedServices = await tx.insert(rentalServices).values(lines.map((line: any) => ({
            rentalId: rental.id, serviceId: line.service.id, name: line.service.name,
            unitPrice: line.unitPrice, days: line.days, discount: line.discount, subtotal: line.subtotal,
          }))).returning();
        }
        const [updated] = await tx.update(rentals).set({ extrasSubtotal, extraDiscount, total })
          .where(and(eq(rentals.id, rental.id), eq(rentals.status, rental.status), eq(rentals.total, rental.total))).returning();
        if (!updated) throw new Error('The rental bill was updated elsewhere. Refresh and try again.');
        await tx.insert(notifications).values({
          userId: rental.renterId,
          type: 'billing_updated',
          body: `FF-${String(rental.id).padStart(4, '0')}`,
          href: `/invoice/${rental.id}?token=${encodeURIComponent(rental.invoiceToken)}`,
          entityType: 'rental',
          entityId: rental.id,
          dedupeKey: `billing-updated-${rental.id}-${Date.now()}`,
        });
        return { updated, savedServices };
      });
      return ok({ rental: { ...saved.updated, services: saved.savedServices } });
    }

    let status: typeof rental.status = rental.status;
    const statusUpdate: any = {};
    let conditionEvent: any = null;
    let lifecycleEvent = String(body.action || status);
    const companyAuthorized = user.role === 'company' && row.companyId === user.companyId;
    const renterAuthorized = user.role === 'renter' && rental.renterId === user.id;

    if (body.action === 'handover') {
      if (!companyAuthorized && !renterAuthorized) throw new Error('You cannot complete this pickup handover.');
      if (rental.status !== 'active' || !rental.confirmedAt) throw new Error('The rental company must confirm this request before pickup.');
      if (rental.pickupOdometer != null) throw new Error('The pickup handover is already recorded.');
      if (body.odometerConfirmed !== true) throw new Error('Confirm the exact odometer shown on the vehicle at pickup.');
      if (body.renterAgreementAccepted !== true) throw new Error('The renter must accept and sign the pickup invoice agreement.');
      const renterSignatureName = String(body.renterSignatureName || '').trim().replace(/\s+/g, ' ').slice(0, 120);
      if (renterSignatureName.length < 2) throw new Error('Enter the renter’s signed full name.');
      const odometer = Math.round(Number(body.odometer));
      const fuelLevel = Math.round(Number(body.fuelLevel));
      if (!Number.isFinite(odometer) || odometer < latestSystemOdometer) throw new Error('Enter a valid pickup odometer reading that is not lower than the latest system reading.');
      if (!Number.isFinite(fuelLevel) || fuelLevel < 25 || fuelLevel > 100) throw new Error('KSA rental handover requires at least 25% fuel. Enter a value from 25 to 100.');
      const signedAt = new Date();
      statusUpdate.pickupOdometer = odometer;
      statusUpdate.pickupFuelLevel = fuelLevel;
      statusUpdate.renterOdometerAcknowledged = true;
      statusUpdate.renterOdometerAcknowledgedAt = signedAt;
      statusUpdate.renterSignatureName = renterSignatureName;
      statusUpdate.renterSignedAt = signedAt;
      statusUpdate.handoverByRole = user.role;
      statusUpdate.handoverByUserId = user.id;
      statusUpdate.invoiceIssuedAt = signedAt;
      conditionEvent = {
        eventType:'pickup', odometer, fuelLevel,
        notes:`Rental pickup handover ${user.role === 'renter' ? 'confirmed by renter' : 'recorded by company on renter behalf'}: ${renterSignatureName}`,
      };
      lifecycleEvent = 'handover';
    } else if (user.role === 'company') {
      if (!companyAuthorized) throw new Error('You cannot manage this rental.');
      if (body.action === 'confirm' && rental.status === 'pending') {
        status = 'active';
        statusUpdate.confirmedAt = new Date();
        lifecycleEvent = 'confirmed';
      } else if (body.action === 'complete' && rental.status === 'active') {
        if (rental.pickupOdometer == null) throw new Error('Complete the pickup handover before opening the return inspection.');
        status = 'completed';
        if (body.odometerConfirmed !== true) throw new Error('Company staff must confirm the latest return odometer reading.');
        if (body.paymentConfirmed !== true) throw new Error('Confirm that the recalculated final amount has been paid before issuing the Paid waybill.');
        const odometer = Math.round(Number(body.odometer));
        const fuelLevel = Math.round(Number(body.fuelLevel));
        const minimumOdometer = Math.max(latestSystemOdometer, rental.pickupOdometer);
        if (!Number.isFinite(odometer) || odometer < minimumOdometer) throw new Error('Return odometer cannot be lower than the pickup or current vehicle reading.');
        if (!Number.isFinite(fuelLevel) || fuelLevel < 0 || fuelLevel > 100) throw new Error('Fuel level must be between 0 and 100.');
        const fuelCharge = roundMoney(Math.max(0, Number(body.fuelCharge) || 0));
        const traveledKilometers = Math.max(0, odometer - rental.pickupOdometer);
        const excessKilometers = Math.max(0, traveledKilometers - Number(rental.allowedKilometers || 0));
        const excessDistanceCharge = roundMoney(excessKilometers * Number(rental.excessKilometerRate || 0));
        const finalTotal = roundMoney(Math.max(0,
          rental.subtotal - rental.discount - rental.loyaltyDiscount + rental.extrasSubtotal + rental.protectionSubtotal
          + fuelCharge + excessDistanceCharge - rental.extraDiscount,
        ));
        const loyaltyPointsEarned = pointsForCompletedRental(finalTotal, rental.loyaltyPointsRate);
        statusUpdate.returnOdometer = odometer;
        statusUpdate.returnFuelLevel = fuelLevel;
        statusUpdate.fuelCharge = fuelCharge;
        statusUpdate.excessDistanceCharge = excessDistanceCharge;
        statusUpdate.total = finalTotal;
        statusUpdate.loyaltyPointsEarned = loyaltyPointsEarned;
        statusUpdate.paidAt = new Date();
        conditionEvent = { eventType:'return', odometer, fuelLevel, fuelCost:fuelCharge || null, notes:'Rental return inspection and final paid waybill' };
        lifecycleEvent = 'completed';
      } else if (body.action === 'cancel' && ['pending', 'active'].includes(rental.status) && rental.pickupOdometer == null) {
        status = 'cancelled';
        lifecycleEvent = 'cancelled';
      } else throw new Error('This status transition is not allowed.');
    } else {
      if (!renterAuthorized || body.action !== 'cancel' || !['pending', 'active'].includes(rental.status) || rental.pickupOdometer != null) {
        throw new Error('This rental cannot be cancelled.');
      }
      status = 'cancelled';
      lifecycleEvent = 'cancelled';
    }
    const updated = await db.transaction(async (tx:any) => {
      const updateGuard = body.action === 'handover'
        ? and(eq(rentals.id, rental.id), eq(rentals.status, 'active'), isNull(rentals.pickupOdometer))
        : and(eq(rentals.id, rental.id), eq(rentals.status, rental.status));
      const [savedRental] = await tx.update(rentals).set({ status, ...statusUpdate })
        .where(updateGuard).returning();
      if (!savedRental) throw new Error('The rental was updated elsewhere. Refresh and try again.');
      if (conditionEvent) {
        const [savedVehicle] = await tx.update(vehicles)
          .set({ odometer: conditionEvent.odometer, fuelLevel: conditionEvent.fuelLevel })
          .where(and(eq(vehicles.id, row.vehicleId), eq(vehicles.odometer, row.vehicleOdometer))).returning({ id: vehicles.id });
        if (!savedVehicle) throw new Error('The vehicle reading was updated elsewhere. Refresh and enter the latest reading.');
        await tx.insert(vehicleConditionLogs).values({
          companyId: row.companyId, vehicleId: row.vehicleId, rentalId: rental.id,
          recordedBy: user.id, ...conditionEvent,
        });
      }
      if (lifecycleEvent === 'completed' && savedRental.loyaltyPointsEarned > 0) {
        await tx.insert(loyaltyPointLedger).values({
          companyId:row.companyId,
          renterId:rental.renterId,
          rentalId:rental.id,
          points:savedRental.loyaltyPointsEarned,
          eligibleSpend:savedRental.total,
        }).onConflictDoNothing();
        await tx.insert(notifications).values({
          userId:rental.renterId,
          type:'system',
          body:`+${savedRental.loyaltyPointsEarned} loyalty points · FF-${String(rental.id).padStart(4, '0')}`,
          href:'/dashboard',
          entityType:'loyalty_points',
          entityId:rental.id,
          dedupeKey:`loyalty-points-${rental.id}`,
        }).onConflictDoNothing();
      }
      await tx.insert(notifications).values({
        ...(user.role === 'company' ? { userId: rental.renterId } : { companyId: row.companyId }),
        type: 'rental_status',
        body: `FF-${String(rental.id).padStart(4, '0')} · ${lifecycleEvent}`,
        href: '/dashboard/rentals',
        entityType: 'rental',
        entityId: rental.id,
        dedupeKey: `rental-status-${rental.id}-${status}-${Date.now()}`,
      });
      return savedRental;
    });
    const services = await db.select().from(rentalServices).where(eq(rentalServices.rentalId, rental.id));
    return ok({ rental: { ...updated, services } });
  } catch (error) { return fail(error); }
}
