import fs from 'node:fs';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { getDb } from '@/db';
import { companies, rentals, rentalServices, users, vehicles } from '@/db/schema';
import { getSession } from './auth';

export async function loadInvoice(rentalId: number, token?: string | null) {
  const db = await getDb();
  const [row] = await db.select({
    id: rentals.id, renterId: rentals.renterId, status: rentals.status, rateType: rentals.rateType,
    quantity: rentals.quantity, startsAt: rentals.startsAt, endsAt: rentals.endsAt,
    subtotal: rentals.subtotal, discount: rentals.discount, extrasSubtotal: rentals.extrasSubtotal,
    extraDiscount: rentals.extraDiscount, total: rentals.total, promoCode: rentals.promoCode,
    invoiceToken: rentals.invoiceToken, pickupLocation: rentals.pickupLocation, createdAt: rentals.createdAt,
    vehicleId: vehicles.id, companyId: vehicles.companyId, make: vehicles.make, model: vehicles.model,
    year: vehicles.year, category: vehicles.category, gearbox: vehicles.gearbox, fuel: vehicles.fuel,
    seats: vehicles.seats, color: vehicles.color, licensePlate: vehicles.licensePlate,
    odometer: vehicles.odometer, image: vehicles.image,
    companyName: companies.name, companyCity: companies.city, companyLogo: companies.logo,
    renterName: users.name, renterEmail: users.email, renterPhone: users.phone,
  }).from(rentals).innerJoin(vehicles, eq(rentals.vehicleId, vehicles.id))
    .innerJoin(companies, eq(vehicles.companyId, companies.id))
    .innerJoin(users, eq(rentals.renterId, users.id))
    .where(eq(rentals.id, rentalId)).limit(1);
  if (!row) throw new Error('Invoice not found.');

  const session = await getSession();
  const tokenAccess = !!token && token === row.invoiceToken;
  const accountAccess = !!session && (session.id === row.renterId || (session.role === 'company' && session.companyId === row.companyId));
  if (!tokenAccess && !accountAccess) throw new Error('You do not have access to this invoice.');

  const services = await db.select().from(rentalServices).where(eq(rentalServices.rentalId, row.id));
  return {
    invoiceNumber: `FF-${new Date(row.createdAt).getFullYear()}-${String(row.id).padStart(5, '0')}`,
    documentType: row.status === 'pending' ? 'Rental proposal' : 'Rental invoice',
    rental: row,
    services: services.map((service: any) => ({ ...service, total: service.subtotal - service.discount })),
    breakdown: {
      vehicleRental: row.subtotal,
      promotionDiscount: row.discount,
      servicesSubtotal: row.extrasSubtotal,
      additionalDiscount: row.extraDiscount,
      grandTotal: row.total,
    },
  };
}

const money = (value: number) => `$${Number(value).toFixed(2)}`;
const date = (value: Date | string) => new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));

export async function createInvoicePdf(invoice: any) {
  const pdf = await PDFDocument.create();
  let page = pdf.addPage([595.28, 841.89]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const green = rgb(0.18, 0.36, 0.3);
  const dark = rgb(0.12, 0.16, 0.14);
  const muted = rgb(0.43, 0.48, 0.45);
  const line = rgb(0.88, 0.9, 0.88);
  const r = invoice.rental;
  const draw = (text: string, x: number, y: number, size = 9, font = regular, color = dark) => page.drawText(String(text), { x, y, size, font, color });
  const rule = (y: number) => page.drawLine({ start: { x: 42, y }, end: { x: 553, y }, thickness: 0.8, color: line });

  page.drawRectangle({ x: 0, y: 735, width: 595.28, height: 106.89, color: green });
  draw('FLEETFLOW', 42, 798, 18, bold, rgb(1, 1, 1));
  draw(invoice.documentType.toUpperCase(), 42, 774, 10, regular, rgb(0.82, 0.9, 0.86));
  draw(invoice.invoiceNumber, 420, 797, 11, bold, rgb(1, 1, 1));
  draw(`Issued ${date(r.createdAt)}`, 420, 778, 7.5, regular, rgb(0.82, 0.9, 0.86));

  draw('ISSUED BY', 42, 708, 7, bold, green);
  draw(r.companyName, 42, 690, 12, bold);
  draw(r.companyCity, 42, 675, 8, regular, muted);
  draw('BILLED TO', 325, 708, 7, bold, green);
  draw(r.renterName, 325, 690, 12, bold);
  draw(r.renterEmail, 325, 675, 8, regular, muted);
  draw(r.renterPhone || '', 325, 662, 8, regular, muted);
  rule(643);

  draw('RENTED VEHICLE', 42, 620, 7, bold, green);
  let vehicleImage: any = null;
  try {
    const file = fs.readFileSync(path.join(process.cwd(), 'public', r.image.replace(/^\//, '')));
    vehicleImage = await pdf.embedJpg(file);
  } catch { /* PDF remains complete without the optional image. */ }
  if (vehicleImage) page.drawImage(vehicleImage, { x: 42, y: 510, width: 170, height: 96 });
  draw(`${r.make} ${r.model}`, 232, 590, 14, bold);
  draw(`${r.year} ${r.category}  |  ${r.color}`, 232, 572, 8, regular, muted);
  draw(`Plate: ${r.licensePlate}  |  ${r.gearbox}  |  ${r.fuel}  |  ${r.seats} seats`, 232, 553, 8);
  draw(`Odometer: ${Number(r.odometer).toLocaleString()} mi`, 232, 536, 8, regular, muted);
  draw(`Pickup: ${r.pickupLocation}`, 232, 519, 8, regular, muted);
  rule(493);

  draw('RENTAL SCHEDULE', 42, 470, 7, bold, green);
  draw('Pickup', 42, 448, 7, bold, muted); draw(date(r.startsAt), 42, 433, 9, bold);
  draw('Return', 220, 448, 7, bold, muted); draw(date(r.endsAt), 220, 433, 9, bold);
  draw('Rate', 420, 448, 7, bold, muted); draw(`${r.quantity} × ${r.rateType}`, 420, 433, 9, bold);
  rule(411);

  draw('DETAILED RENT BREAKDOWN', 42, 388, 7, bold, green);
  let y = 365;
  const lineItem = (label: string, detail: string, amount: number, negative = false) => {
    draw(label, 42, y, 9, negative ? regular : bold, negative ? green : dark);
    draw(detail, 270, y, 8, regular, muted);
    draw(`${negative ? '-' : ''}${money(amount)}`, 480, y, 9, bold, negative ? green : dark);
    y -= 24;
  };
  lineItem(`${r.make} ${r.model} rental`, `${r.quantity} ${r.rateType}${r.quantity > 1 ? 's' : ''}`, r.subtotal);
  if (r.discount > 0) lineItem(`Promotion ${r.promoCode || ''}`, 'Vehicle rental discount', r.discount, true);
  for (const service of invoice.services) {
    lineItem(service.name, `${service.days} day${service.days > 1 ? 's' : ''} × ${money(service.unitPrice)}`, service.subtotal);
    if (service.discount > 0) lineItem(`${service.name} discount`, 'Service discount', service.discount, true);
  }
  if (r.extraDiscount > 0) lineItem('Additional company discount', 'Applied by company administrator', r.extraDiscount, true);
  rule(y + 8);
  draw('TOTAL DUE', 365, y - 19, 10, bold);
  draw(money(r.total), 480, y - 19, 14, bold, green);
  y -= 58;
  page.drawRectangle({ x: 42, y: Math.max(74, y - 45), width: 511, height: 48, color: rgb(0.94, 0.97, 0.95) });
  draw('Reservation status', 56, Math.max(91, y - 25), 7, regular, muted);
  draw(r.status.toUpperCase(), 56, Math.max(77, y - 39), 10, bold, green);
  draw('This document includes the vehicle, rental period, discounts, and all premium services.', 185, Math.max(83, y - 33), 7.5, regular, muted);
  draw('FleetFlow  •  Every journey, perfectly managed.', 42, 36, 7, regular, muted);
  return pdf.save();
}
