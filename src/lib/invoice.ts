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

const pdfTranslations: Record<string, string> = {
  'Rental proposal': 'عرض سعر إيجار', 'Rental invoice': 'فاتورة إيجار',
  'ISSUED BY': 'صادرة عن', 'BILLED TO': 'محررة إلى', 'Issued': 'تاريخ الإصدار',
  'RENTED VEHICLE': 'السيارة المستأجرة', Plate: 'رقم اللوحة', Odometer: 'عداد المسافة',
  Pickup: 'الاستلام', Return: 'الإعادة', Rate: 'خطة السعر', seats: 'مقاعد', mi: 'ميل',
  'RENTAL SCHEDULE': 'جدول الإيجار', 'DETAILED RENT BREAKDOWN': 'تفاصيل تكلفة الإيجار',
  rental: 'إيجار', Promotion: 'العرض', 'Vehicle rental discount': 'خصم إيجار السيارة',
  day: 'يوم', days: 'أيام', 'Service discount': 'خصم الخدمة', discount: 'خصم',
  'Additional company discount': 'خصم إضافي من الشركة', 'Applied by company administrator': 'طبقه مدير الشركة',
  'TOTAL DUE': 'الإجمالي المستحق', 'Reservation status': 'حالة الحجز',
  'This document includes the vehicle, rental period, discounts, and all premium services.': 'تشمل هذه الوثيقة السيارة وفترة الإيجار والخصومات وجميع الخدمات المميزة.',
  'FleetFlow  •  Every journey, perfectly managed.': 'فليت فلو  •  كل رحلة بإدارة متقنة.',
  pending: 'معلق', active: 'نشط', completed: 'مكتمل', cancelled: 'ملغي',
  Automatic: 'أوتوماتيك', Manual: 'يدوي', Hybrid: 'هجين', Electric: 'كهربائي', Petrol: 'بنزين', Diesel: 'ديزل',
  'Luxury sedan': 'سيدان فاخرة', Executive: 'تنفيذية', 'Premium SUV': 'دفع رباعي مميزة',
  'Electric SUV': 'دفع رباعي كهربائية', Sedan: 'سيدان', Performance: 'رياضية', SUV: 'دفع رباعي',
  'Luxury SUV': 'دفع رباعي فاخرة', 'Electric sedan': 'سيدان كهربائية',
  'Professional driver': 'سائق محترف', 'Executive chauffeur': 'سائق تنفيذي', 'EV-trained driver': 'سائق مدرّب على السيارات الكهربائية',
  'Loading & offloading help': 'مساعدة تحميل وتنزيل الأمتعة', 'Luggage concierge': 'خدمة الأمتعة',
  'Child safety seat': 'مقعد أمان للطفل', 'Premium child seat': 'مقعد طفل مميز',
  'In-car Wi-Fi': 'واي فاي داخل السيارة', 'Executive Wi-Fi': 'واي فاي تنفيذي', 'Connected car Wi-Fi': 'واي فاي للسيارة المتصلة',
  hour: 'ساعة', week: 'أسبوع', month: 'شهر',
};

const money = (value: number, locale: 'en' | 'ar') => locale === 'ar' ? `${Number(value).toFixed(2)} $` : `$${Number(value).toFixed(2)}`;
const date = (value: Date | string, locale: 'en' | 'ar') => new Intl.DateTimeFormat(locale === 'ar' ? 'ar' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));

export async function createInvoicePdf(invoice: any, locale: 'en' | 'ar' = 'en') {
  const pdf = await PDFDocument.create();
  let page = pdf.addPage([595.28, 841.89]);
  const arabic = locale === 'ar';
  let regular: any;
  let bold: any;
  let visual = (text: string) => String(text);
  if (arabic) {
    const fontkit = (await import('@pdf-lib/fontkit')).default;
    const bidiFactory = (await import('bidi-js')).default;
    const { ArabicShaper } = await import('arabic-persian-reshaper');
    const bidi = bidiFactory();
    pdf.registerFontkit(fontkit);
    regular = await pdf.embedFont(fs.readFileSync(path.join(process.cwd(), 'public/fonts/DejaVuSans.ttf')), { subset: true });
    bold = await pdf.embedFont(fs.readFileSync(path.join(process.cwd(), 'public/fonts/DejaVuSans-Bold.ttf')), { subset: true });
    visual = (input: string) => {
      const shaped = ArabicShaper.convertArabic(String(input));
      const chars = Array.from(shaped);
      const levels = bidi.getEmbeddingLevels(shaped, 'rtl');
      for (const [start, end] of bidi.getReorderSegments(shaped, levels)) {
        chars.splice(start, end - start + 1, ...chars.slice(start, end + 1).reverse());
      }
      return chars.join('');
    };
  } else {
    regular = await pdf.embedFont(StandardFonts.Helvetica);
    bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  }
  const green = rgb(0.18, 0.36, 0.3);
  const dark = rgb(0.12, 0.16, 0.14);
  const muted = rgb(0.43, 0.48, 0.45);
  const line = rgb(0.88, 0.9, 0.88);
  const r = invoice.rental;
  const tx = (text: string) => arabic ? (pdfTranslations[text] || text) : text;
  const draw = (text: string, x: number, y: number, size = 9, font = regular, color = dark) => {
    const rendered = arabic ? visual(String(text)) : String(text);
    const drawX = arabic ? 595.28 - x - font.widthOfTextAtSize(rendered, size) : x;
    page.drawText(rendered, { x: drawX, y, size, font, color });
  };
  const rule = (y: number) => page.drawLine({ start: { x: 42, y }, end: { x: 553, y }, thickness: 0.8, color: line });

  page.drawRectangle({ x: 0, y: 735, width: 595.28, height: 106.89, color: green });
  draw(arabic ? 'فليت فلو' : 'FLEETFLOW', 42, 798, 18, bold, rgb(1, 1, 1));
  draw(tx(invoice.documentType), 42, 774, 10, regular, rgb(0.82, 0.9, 0.86));
  draw(invoice.invoiceNumber, 420, 797, 11, bold, rgb(1, 1, 1));
  draw(`${tx('Issued')} ${date(r.createdAt, locale)}`, 420, 778, 7.5, regular, rgb(0.82, 0.9, 0.86));

  draw(tx('ISSUED BY'), 42, 708, 7, bold, green);
  draw(r.companyName, 42, 690, 12, bold);
  draw(r.companyCity, 42, 675, 8, regular, muted);
  draw(tx('BILLED TO'), 325, 708, 7, bold, green);
  draw(r.renterName, 325, 690, 12, bold);
  draw(r.renterEmail, 325, 675, 8, regular, muted);
  draw(r.renterPhone || '', 325, 662, 8, regular, muted);
  rule(643);

  draw(tx('RENTED VEHICLE'), 42, 620, 7, bold, green);
  let vehicleImage: any = null;
  try {
    const file = fs.readFileSync(path.join(process.cwd(), 'public', r.image.replace(/^\//, '')));
    vehicleImage = await pdf.embedJpg(file);
  } catch { /* PDF remains complete without the optional image. */ }
  if (vehicleImage) page.drawImage(vehicleImage, { x: arabic ? 383.28 : 42, y: 510, width: 170, height: 96 });
  draw(`${r.make} ${r.model}`, 232, 590, 14, bold);
  draw(`${r.year} ${tx(r.category)}  |  ${r.color}`, 232, 572, 8, regular, muted);
  draw(`${tx('Plate')}: ${r.licensePlate}  |  ${tx(r.gearbox)}  |  ${tx(r.fuel)}  |  ${r.seats} ${tx('seats')}`, 232, 553, 8);
  draw(`${tx('Odometer')}: ${Number(r.odometer).toLocaleString(arabic ? 'ar' : 'en-US')} ${tx('mi')}`, 232, 536, 8, regular, muted);
  draw(`${tx('Pickup')}: ${r.pickupLocation}`, 232, 519, 8, regular, muted);
  rule(493);

  draw(tx('RENTAL SCHEDULE'), 42, 470, 7, bold, green);
  draw(tx('Pickup'), 42, 448, 7, bold, muted); draw(date(r.startsAt, locale), 42, 433, 9, bold);
  draw(tx('Return'), 220, 448, 7, bold, muted); draw(date(r.endsAt, locale), 220, 433, 9, bold);
  draw(tx('Rate'), 420, 448, 7, bold, muted); draw(`${r.quantity} × ${tx(r.rateType)}`, 420, 433, 9, bold);
  rule(411);

  draw(tx('DETAILED RENT BREAKDOWN'), 42, 388, 7, bold, green);
  let y = 365;
  const lineItem = (label: string, detail: string, amount: number, negative = false) => {
    draw(label, 42, y, 9, negative ? regular : bold, negative ? green : dark);
    draw(detail, 270, y, 8, regular, muted);
    draw(`${negative ? '-' : ''}${money(amount, locale)}`, 480, y, 9, bold, negative ? green : dark);
    y -= 24;
  };
  lineItem(`${r.make} ${r.model} ${tx('rental')}`, `${r.quantity} ${tx(r.rateType)}`, r.subtotal);
  if (r.discount > 0) lineItem(`${tx('Promotion')} ${r.promoCode || ''}`, tx('Vehicle rental discount'), r.discount, true);
  for (const service of invoice.services) {
    const serviceName = tx(service.name);
    lineItem(serviceName, `${service.days} ${tx(service.days > 1 ? 'days' : 'day')} × ${money(service.unitPrice, locale)}`, service.subtotal);
    if (service.discount > 0) lineItem(`${serviceName} ${tx('discount')}`, tx('Service discount'), service.discount, true);
  }
  if (r.extraDiscount > 0) lineItem(tx('Additional company discount'), tx('Applied by company administrator'), r.extraDiscount, true);
  rule(y + 8);
  draw(tx('TOTAL DUE'), 365, y - 19, 10, bold);
  draw(money(r.total, locale), 480, y - 19, 14, bold, green);
  y -= 58;
  page.drawRectangle({ x: 42, y: Math.max(74, y - 45), width: 511, height: 48, color: rgb(0.94, 0.97, 0.95) });
  draw(tx('Reservation status'), 56, Math.max(91, y - 25), 7, regular, muted);
  draw(tx(r.status).toUpperCase(), 56, Math.max(77, y - 39), 10, bold, green);
  draw(tx('This document includes the vehicle, rental period, discounts, and all premium services.'), 185, Math.max(83, y - 33), 7.5, regular, muted);
  draw(tx('FleetFlow  •  Every journey, perfectly managed.'), 42, 36, 7, regular, muted);
  return pdf.save();
}
