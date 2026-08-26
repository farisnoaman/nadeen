import fs from 'node:fs';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { getDb } from '@/db';
import { companies, rentals, rentalServices, users, vehicles } from '@/db/schema';
import { getSession } from './auth';
import { rentalDocumentStage, rentalDocumentTitle } from './rental-document';

export async function loadInvoice(rentalId: number, token?: string | null) {
  const db = await getDb();
  const [row] = await db.select({
    id: rentals.id, renterId: rentals.renterId, status: rentals.status, rateType: rentals.rateType,
    quantity: rentals.quantity, startsAt: rentals.startsAt, endsAt: rentals.endsAt,
    subtotal: rentals.subtotal, discount: rentals.discount,
    loyaltyLevelId:rentals.loyaltyLevelId, loyaltyLevelName:rentals.loyaltyLevelName,
    loyaltyDiscountPercentage:rentals.loyaltyDiscountPercentage, loyaltyDiscount:rentals.loyaltyDiscount,
    loyaltyPointsRate:rentals.loyaltyPointsRate, loyaltyPointsEarned:rentals.loyaltyPointsEarned,
    extrasSubtotal: rentals.extrasSubtotal,
    bookingOdometer: rentals.bookingOdometer,
    renterOdometerAcknowledged: rentals.renterOdometerAcknowledged,
    renterOdometerAcknowledgedAt: rentals.renterOdometerAcknowledgedAt,
    confirmedAt: rentals.confirmedAt,
    renterSignatureName: rentals.renterSignatureName, renterSignedAt: rentals.renterSignedAt,
    handoverByRole: rentals.handoverByRole, handoverByUserId: rentals.handoverByUserId,
    invoiceIssuedAt: rentals.invoiceIssuedAt, paidAt: rentals.paidAt,
    protectionPackageId: rentals.protectionPackageId,
    protectionTier: rentals.protectionTier, protectionName: rentals.protectionName,
    protectionDailyPrice: rentals.protectionDailyPrice, protectionDays: rentals.protectionDays,
    protectionSubtotal: rentals.protectionSubtotal, protectionDeductible: rentals.protectionDeductible,
    protectionCoverage: rentals.protectionCoverage, extraDiscount: rentals.extraDiscount,
    fuelCharge: rentals.fuelCharge, pickupOdometer: rentals.pickupOdometer,
    returnOdometer: rentals.returnOdometer, pickupFuelLevel: rentals.pickupFuelLevel,
    returnFuelLevel: rentals.returnFuelLevel, dailyKilometerAllowance: rentals.dailyKilometerAllowance,
    allowedKilometers: rentals.allowedKilometers, excessKilometerRate: rentals.excessKilometerRate,
    kilometerPolicyId: rentals.kilometerPolicyId, kilometerPolicyName: rentals.kilometerPolicyName,
    excessDistanceCharge: rentals.excessDistanceCharge,
    total: rentals.total, promoCode: rentals.promoCode,
    invoiceToken: rentals.invoiceToken, pickupCity: rentals.pickupCity,
    pickupLocation: rentals.pickupLocation, returnCity: rentals.returnCity,
    returnLocation: rentals.returnLocation, createdAt: rentals.createdAt,
    vehicleId: vehicles.id, companyId: vehicles.companyId, make: vehicles.make, model: vehicles.model,
    year: vehicles.year, category: vehicles.category, gearbox: vehicles.gearbox, fuel: vehicles.fuel,
    seats: vehicles.seats, color: vehicles.color, licensePlate: vehicles.licensePlate,
    odometer: vehicles.odometer, fuelLevel: vehicles.fuelLevel, fuelPolicy: vehicles.fuelPolicy,
    insuranceCoverage: vehicles.insuranceCoverage, insuranceProvider: vehicles.insuranceProvider,
    insurancePolicyNumber: vehicles.insurancePolicyNumber, insurancePolicyExpiry: vehicles.insurancePolicyExpiry,
    insuranceDeductible: vehicles.insuranceDeductible, image: vehicles.image,
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
  const documentStage = rentalDocumentStage(row);
  const documentDate = documentStage === 'paid'
    ? row.paidAt || row.endsAt
    : documentStage === 'issued'
      ? row.invoiceIssuedAt || row.startsAt
      : row.createdAt;
  return {
    invoiceNumber: `FF-${new Date(row.createdAt).getFullYear()}-${String(row.id).padStart(5, '0')}`,
    documentStage,
    documentType: rentalDocumentTitle(documentStage),
    documentDate,
    rental: row,
    services: services.map((service: any) => ({ ...service, total: service.subtotal - service.discount })),
    breakdown: {
      vehicleRental: row.subtotal,
      promotionDiscount: row.discount,
      loyaltyDiscount:row.loyaltyDiscount,
      loyaltyLevel:row.loyaltyLevelName,
      loyaltyPointsEarned:row.loyaltyPointsEarned,
      servicesSubtotal: row.extrasSubtotal,
      protectionSubtotal: row.protectionSubtotal,
      fuelCharge: row.fuelCharge,
      excessDistanceCharge: row.excessDistanceCharge,
      additionalDiscount: row.extraDiscount,
      grandTotal: row.total,
    },
  };
}

const pdfTranslations: Record<string, string> = {
  'Rental proposal': 'عرض سعر', 'Rental sales invoice': 'فاتورة مبيعات', 'Final rental waybill': 'فاتورة الإيجار النهائية',
  Quotation: 'عرض سعر', Issued: 'فاتورة مبيعات', Paid: 'مدفوعة',
  'Quoted at': 'تاريخ عرض السعر', 'Issued at': 'تاريخ الإصدار', 'Paid at': 'تاريخ السداد',
  'ISSUED BY': 'صادرة عن', 'BILLED TO': 'محررة إلى',
  'RENTED VEHICLE': 'السيارة المستأجرة', Plate: 'رقم اللوحة', Odometer: 'عداد المسافة', Booked: 'الحجز', Acknowledged: 'تم الإقرار',
  Insurance: 'التأمين', Policy: 'الوثيقة', Expires: 'تنتهي', Fuel: 'الوقود', Deductible: 'نسبة التحمل', Coverage: 'التغطية', 'Protection package': 'باقة الحماية', 'Fuel charge': 'رسوم الوقود', 'Excess distance': 'المسافة الزائدة',
  Pickup: 'الاستلام', Return: 'الإعادة', 'Pickup location': 'موقع الاستلام', 'Pickup site': 'موقع الاستلام',
  'Pickup city': 'مدينة الاستلام', 'Return site': 'موقع الإعادة', 'Return city': 'مدينة الإعادة',
  Rate: 'خطة السعر', 'Allowed KM per day': 'الكيلومترات المسموحة يومياً', 'Total allowance': 'إجمالي المسافة المسموحة', 'Fee per excess KM': 'رسوم كل كيلومتر زائد', seats: 'مقاعد', km: 'كم',
  'RENTAL SCHEDULE': 'جدول الإيجار', 'DETAILED RENT BREAKDOWN': 'تفاصيل تكلفة الإيجار',
  rental: 'إيجار', Promotion: 'العرض', 'Vehicle rental discount': 'خصم إيجار السيارة',
  'Loyalty discount':'خصم الولاء', 'Loyalty points earned':'نقاط الولاء المكتسبة', points:'نقطة',
  day: 'يوم', days: 'أيام', 'Service discount': 'خصم الخدمة', discount: 'خصم',
  'Additional company discount': 'خصم إضافي من الشركة', 'Applied by company administrator': 'طبقه مدير الشركة',
  'TOTAL DUE': 'الإجمالي المستحق', 'TOTAL PAID': 'الإجمالي المدفوع', 'Reservation status': 'حالة الحجز', 'Document status': 'حالة المستند',
  'Renter signature': 'توقيع المستأجر', 'Signed at pickup': 'وُقّعت عند الاستلام', 'Handover recorded': 'تم تسجيل التسليم', 'Pickup ODO accepted': 'تم إقرار عداد الاستلام', 'Confirmed by renter': 'أكده المستأجر', 'Company-assisted handover': 'تسليم بمساعدة الشركة',
  'Signature required at pickup': 'التوقيع مطلوب عند الاستلام', 'Exact pickup ODO will be printed on the issued invoice': 'سيظهر عداد الاستلام الدقيق في فاتورة المبيعات',
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
  hour: 'ساعة', week: 'أسبوع', month: 'شهر', basic: 'أساسية', pro: 'احترافية', premium: 'مميزة', full: 'شاملة',
  third_party: 'مسؤولية تجاه الغير', comprehensive: 'تأمين شامل',
};

const money = (value: number, locale: 'en' | 'ar') => locale === 'ar' ? `${Number(value).toFixed(2)} $` : `$${Number(value).toFixed(2)}`;
const date = (value: Date | string, locale: 'en' | 'ar') => new Intl.DateTimeFormat(locale === 'ar' ? 'ar' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));

export async function createInvoicePdf(invoice: any, locale: 'en' | 'ar' = 'ar') {
  const pdf = await PDFDocument.create();
  let page = pdf.addPage([595.28, 841.89]);
  const arabic = locale === 'ar';
  let regular: any;
  let bold: any;
  let visual = (text: string) => String(text);
  if (arabic) {
    const fontkit = (await import('@pdf-lib/fontkit')).default;
    const bidiFactory = (await import('bidi-js')).default;
    const reshaperModule:any = await import('arabic-persian-reshaper');
    const ArabicShaper = reshaperModule.ArabicShaper || reshaperModule.default?.ArabicShaper;
    const bidi = bidiFactory();
    pdf.registerFontkit(fontkit);
    regular = await pdf.embedFont(fs.readFileSync(path.join(process.cwd(), 'public/fonts/ReadexPro.ttf')), { subset: true });
    bold = await pdf.embedFont(fs.readFileSync(path.join(process.cwd(), 'public/fonts/ReadexPro-Bold.ttf')), { subset: true });
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

  const stageLabel = invoice.documentStage === 'quotation' ? 'Quotation' : invoice.documentStage === 'issued' ? 'Issued' : 'Paid';
  const dateLabel = invoice.documentStage === 'quotation' ? 'Quoted at' : invoice.documentStage === 'issued' ? 'Issued at' : 'Paid at';
  page.drawRectangle({ x: 0, y: 735, width: 595.28, height: 106.89, color: green });
  draw(arabic ? 'فليت فلو' : 'FLEETFLOW', 42, 798, 18, bold, rgb(1, 1, 1));
  draw(tx(invoice.documentType), 42, 774, 10, regular, rgb(0.82, 0.9, 0.86));
  draw(invoice.invoiceNumber, 420, 797, 11, bold, rgb(1, 1, 1));
  draw(`${tx(dateLabel)} ${date(invoice.documentDate, locale)}`, 420, 778, 7.2, regular, rgb(0.82, 0.9, 0.86));
  page.drawRectangle({ x: arabic ? 92 : 420, y: 748, width: 92, height: 18, color: rgb(0.91, 0.96, 0.93), borderColor:rgb(1,1,1), borderWidth:.5 });
  draw(tx(stageLabel).toUpperCase(), 428, 754, 7, bold, green);

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
  draw(`${tx('Insurance')}: ${tx(r.insuranceCoverage)}  |  ${r.insuranceProvider || '-'}`, 232, 537, 7.5, regular, muted);
  draw(`${tx('Policy')}: ${r.insurancePolicyNumber || '-'}  |  ${tx('Expires')}: ${r.insurancePolicyExpiry ? date(r.insurancePolicyExpiry, locale) : '-'}  |  ${tx('Deductible')}: ${money(r.insuranceDeductible, locale)}`, 232, 521, 7, regular, muted);
  draw(`${tx('Odometer')}: ${tx('Booked')} ${r.bookingOdometer ?? '-'} | ${r.pickupOdometer ?? '-'} -> ${r.returnOdometer ?? '-'} ${tx('km')}  |  ${tx('Fuel')}: ${r.pickupFuelLevel ?? '-'}% -> ${r.returnFuelLevel ?? '-'}%`, 232, 505, 7, regular, muted);
  rule(493);

  draw(tx('RENTAL SCHEDULE'), 42, 470, 7, bold, green);
  draw(tx('Pickup'), 42, 448, 7, bold, muted); draw(date(r.startsAt, locale), 42, 433, 9, bold);
  draw(tx('Return'), 307, 448, 7, bold, muted); draw(date(r.endsAt, locale), 307, 433, 9, bold);
  draw(`${tx('Return site')}: ${r.returnLocation} · ${r.returnCity}`, 307, 419, 6.2, regular, muted);
  draw(tx('Pickup site'), 42, 410, 7, bold, muted); draw(`${r.pickupLocation} · ${r.pickupCity}`, 42, 395, 7.5, bold);
  draw(tx('Rate'), 307, 410, 7, bold, muted); draw(`${r.quantity} × ${tx(r.rateType)}`, 307, 395, 8.5, bold);
  draw(`${tx('Allowed KM per day')}: ${r.dailyKilometerAllowance} ${tx('km')} / ${tx('day')}`, 307, 382, 6.8, bold, dark);
  draw(`${tx('Fee per excess KM')}: ${money(r.excessKilometerRate, locale)} / ${tx('km')}  |  ${tx('Total allowance')}: ${r.allowedKilometers} ${tx('km')}`, 307, 371, 6.4, regular, muted);
  rule(360);

  draw(tx('DETAILED RENT BREAKDOWN'), 42, 338, 7, bold, green);
  const estimatedRows = 2.5
    + (r.fuelCharge > 0 ? 1 : 0) + (r.excessDistanceCharge > 0 ? 1 : 0) + (r.discount > 0 ? 1 : 0)
    + (r.loyaltyDiscount > 0 ? 1 : 0) + (r.loyaltyPointsEarned > 0 ? 1 : 0)
    + invoice.services.length + invoice.services.filter((service:any) => service.discount > 0).length
    + (r.extraDiscount > 0 ? 1 : 0);
  const lineGap = Math.min(22, 145 / estimatedRows);
  let y = 315;
  const lineItem = (label: string, detail: string, amount: number|string, negative = false) => {
    draw(label, 42, y, 9, negative ? regular : bold, negative ? green : dark);
    draw(detail, 270, y, 8, regular, muted);
    draw(typeof amount === 'number' ? `${negative ? '-' : ''}${money(amount, locale)}` : amount, 480, y, 9, bold, negative ? green : dark);
    y -= lineGap;
  };
  lineItem(`${r.make} ${r.model} ${tx('rental')}`, `${r.quantity} ${tx(r.rateType)}`, r.subtotal);
  lineItem(`${tx('Protection package')} · ${r.protectionName || tx(r.protectionTier)}`, `${r.protectionDays} × ${money(r.protectionDailyPrice, locale)} · ${tx('Deductible')} ${money(r.protectionDeductible, locale)}`, r.protectionSubtotal);
  draw(`${tx('Coverage')}: ${(r.protectionCoverage || []).join(' / ')}`, 42, y + lineGap * 0.35, 6.5, regular, muted);
  y -= lineGap * 0.5;
  if (r.fuelCharge > 0) lineItem(tx('Fuel charge'), `${r.pickupFuelLevel ?? '-'}% -> ${r.returnFuelLevel ?? '-'}%`, r.fuelCharge);
  if (r.excessDistanceCharge > 0) lineItem(tx('Excess distance'), `${Math.max(0, (r.returnOdometer || 0) - (r.pickupOdometer || 0) - (r.allowedKilometers || 0))} ${tx('km')} × ${money(r.excessKilometerRate, locale)}`, r.excessDistanceCharge);
  if (r.discount > 0) lineItem(`${tx('Promotion')} ${r.promoCode || ''}`, tx('Vehicle rental discount'), r.discount, true);
  if (r.loyaltyDiscount > 0) lineItem(`${tx('Loyalty discount')} · ${r.loyaltyLevelName || ''}`, `${r.loyaltyDiscountPercentage}%`, r.loyaltyDiscount, true);
  if (r.loyaltyPointsEarned > 0) lineItem(tx('Loyalty points earned'), r.loyaltyLevelName || '', `+${r.loyaltyPointsEarned} ${tx('points')}`);
  for (const service of invoice.services) {
    const serviceName = tx(service.name);
    lineItem(serviceName, `${service.days} ${tx(service.days > 1 ? 'days' : 'day')} × ${money(service.unitPrice, locale)}`, service.subtotal);
    if (service.discount > 0) lineItem(`${serviceName} ${tx('discount')}`, tx('Service discount'), service.discount, true);
  }
  if (r.extraDiscount > 0) lineItem(tx('Additional company discount'), tx('Applied by company administrator'), r.extraDiscount, true);
  rule(y + 8);
  draw(tx(invoice.documentStage === 'paid' ? 'TOTAL PAID' : 'TOTAL DUE'), 365, y - 19, 10, bold);
  draw(money(r.total, locale), 480, y - 19, 14, bold, green);
  y -= 58;
  const panelY = Math.max(74, y - 45);
  page.drawRectangle({ x: 42, y: panelY, width: 511, height: 48, color: rgb(0.94, 0.97, 0.95) });
  draw(tx('Reservation status'), 56, panelY + 30, 6.5, regular, muted);
  draw(tx(r.status).toUpperCase(), 56, panelY + 14, 9, bold, green);
  draw(tx('Document status'), 188, panelY + 30, 6.5, regular, muted);
  draw(tx(stageLabel).toUpperCase(), 188, panelY + 14, 9, bold, green);
  draw(tx('Renter signature'), 330, panelY + 30, 6.5, regular, muted);
  if (r.renterSignatureName) {
    draw(r.renterSignatureName, 330, panelY + 16, 8.5, bold, dark);
    const handoverSource = r.handoverByRole === 'company' ? 'Company-assisted handover' : 'Confirmed by renter';
    draw(`${tx('Pickup ODO accepted')}: ${r.pickupOdometer ?? '-'} ${tx('km')} · ${tx(handoverSource)}`, 330, panelY + 6, 5.4, regular, muted);
  } else if (r.pickupOdometer != null) {
    draw(tx('Pickup ODO accepted'), 330, panelY + 16, 7.2, bold, dark);
    draw(`${r.pickupOdometer} ${tx('km')} · ${tx('Handover recorded')}`, 330, panelY + 6, 5.8, regular, muted);
  } else {
    draw(tx('Signature required at pickup'), 330, panelY + 15, 7.2, bold, muted);
  }
  draw(tx('FleetFlow  •  Every journey, perfectly managed.'), 42, 36, 7, regular, muted);
  return pdf.save();
}
