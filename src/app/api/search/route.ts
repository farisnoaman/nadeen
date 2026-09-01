import { and, eq, gte, inArray, isNull, lte, or } from 'drizzle-orm';
import { getDb } from '@/db';
import {
  companies,
  insurancePackages,
  kilometerPolicies,
  maintenanceItems,
  maintenanceWorkOrders,
  premiumServices,
  promotions,
  rentalServices,
  rentals,
  supportMessages,
  supportTickets,
  users,
  vehicles,
} from '@/db/schema';
import { requireUser } from '@/lib/auth';
import { fail, ok } from '@/lib/http';

type SearchKind = 'vehicle' | 'rental' | 'maintenance' | 'maintenance_item' | 'insurance' | 'kilometer_policy' | 'promotion' | 'service' | 'support';
type AmountType = 'total' | 'cost' | 'perDay' | 'perKm' | 'discount';

type SearchResult = {
  id: number;
  kind: SearchKind;
  code: string;
  title: string;
  subtitle: string;
  href: string;
  status?: string;
  amount?: number;
  amountType?: AmountType;
  image?: string;
};

type Candidate = SearchResult & { fields: Array<[unknown, number]> };

const entityAliases: Record<SearchKind, string> = {
  vehicle: 'vehicle vehicles car cars fleet license plate سيارة سيارات مركبة مركبات لوحة',
  rental: 'rental rentals booking bookings reservation reservations invoice bill إيجار حجوزات حجز فاتورة',
  maintenance: 'maintenance work order workshop service repair صيانة ورشة أمر عمل إصلاح',
  maintenance_item: 'maintenance catalog preventive service task صيانة وقائية دليل مهمة',
  insurance: 'insurance protection package waiver deductible coverage تأمين حماية باقة إعفاء تحمل تغطية',
  kilometer_policy: 'mileage kilometer policy allowance excess distance odometer fee km سياسة مسافة كيلومتر عداد رسوم حد',
  promotion: 'promotion promotions promo coupon offer discount code عرض عروض خصم كود قسيمة',
  service: 'premium service services extra add-on خدمة خدمات إضافية مميزة',
  support: 'support ticket conversation help message دعم تذكرة محادثة مساعدة رسالة',
};

const normalize = (value: unknown) => String(value ?? '')
  .normalize('NFKD')
  .toLocaleLowerCase()
  .replace(/[٠-٩۰-۹]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit) >= 0 ? '٠١٢٣٤٥٦٧٨٩'.indexOf(digit) : '۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
  .replace(/[\p{P}\p{S}]+/gu, ' ')
  .replace(/\s+/g, ' ')
  .trim();
const compact = (value: unknown) => normalize(value).replace(/[^\p{L}\p{N}]+/gu, '');
const reference = (prefix: string, id: number, size: number) => `${prefix}-${String(id).padStart(size, '0')}`;
const currencyFields = (value: unknown) => {
  const amount = Number(value || 0);
  return [amount, amount.toFixed(2), `$${amount.toFixed(2)}`, amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })];
};
const dateFields = (value: unknown) => {
  if (!value) return [];
  const date = new Date(value as string | Date);
  return Number.isNaN(date.getTime()) ? [] : [date.toISOString(), date.toISOString().slice(0, 10), date.toLocaleDateString('en-US')];
};

function editDistance(left: string, right: string) {
  if (left === right) return 0;
  if (!left.length) return right.length;
  if (!right.length) return left.length;
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const above = previous[j];
      previous[j] = Math.min(previous[j] + 1, previous[j - 1] + 1, diagonal + (left[i - 1] === right[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return previous[right.length];
}

function score(candidate: Candidate, query: string) {
  const normalizedQuery = normalize(query);
  const compactQuery = compact(query);
  if (!normalizedQuery) return 0;
  const queryTerms = normalizedQuery.split(' ').filter(Boolean);
  const referenceQuery = /(?:\b(vehicle|car|booking|rental|reservation|invoice|maintenance|work order|support|ticket|promotion|promo|service)|سيارة|مركبة|حجز|إيجار|فاتورة|صيانة|دعم|تذكرة|عرض|خدمة)\s+\d+\b/.test(normalizedQuery)
    || /(?:total amount|invoice total|maintenance cost|daily rate|daily price|service price|discount value|إجمالي|تكلفة|سعر)\s+\d+\b/.test(normalizedQuery);
  let best = 0;
  let directMatch = false;
  const combined: string[] = [];

  for (const [rawValue, weight] of candidate.fields) {
    const value = normalize(rawValue);
    if (!value) continue;
    combined.push(value);
    const compactValue = compact(value);
    let fieldScore = 0;
    if (value === normalizedQuery) fieldScore = 150;
    else if (compactQuery.length > 1 && compactValue === compactQuery) fieldScore = 142;
    else if (value.startsWith(normalizedQuery)) fieldScore = 105;
    else if (value.split(' ').some(word => word.startsWith(normalizedQuery))) fieldScore = 88;
    else if (value.includes(normalizedQuery)) fieldScore = 70;
    else if (compactQuery.length > 2 && compactValue.includes(compactQuery)) fieldScore = 64;
    if (fieldScore > 0) directMatch = true;
    best = Math.max(best, fieldScore * weight);
  }

  const searchable = combined.join(' ');
  const matchedTerms = queryTerms.filter(term => searchable.includes(term));
  if (matchedTerms.length === queryTerms.length && (!referenceQuery || directMatch)) best += 35 + queryTerms.length * 5;
  else if (queryTerms.length === 1 && matchedTerms.length) best += 7;

  if (best === 0 && queryTerms.length === 1 && normalizedQuery.length >= 4) {
    const words = [...new Set(searchable.split(' ').filter(word => word.length >= 3))].slice(0, 120);
    const threshold = normalizedQuery.length >= 8 ? 2 : 1;
    if (words.some(word => Math.abs(word.length - normalizedQuery.length) <= threshold && editDistance(word, normalizedQuery) <= threshold)) best = 24;
  }
  return best;
}

const add = (candidates: Candidate[], result: SearchResult, fields: Array<[unknown, number]>) => {
  candidates.push({ ...result, fields: [[result.code, 1.7], [result.title, 1.35], [result.subtitle, 1], [entityAliases[result.kind], 0.9], ...fields] });
};

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const url = new URL(request.url);
    const query = String(url.searchParams.get('q') || '').trim().slice(0, 120);
    const limit = Math.min(30, Math.max(5, Number(url.searchParams.get('limit')) || 18));
    if (!query) return ok({ query, results: [], total: 0, groups: {} });

    const db = await getDb();
    const companyId = user.companyId || -1;
    const vehicleAccess = user.role === 'company'
      ? eq(vehicles.companyId, companyId)
      : and(
          eq(vehicles.status, 'available'),
          eq(companies.verificationStatus, 'verified'),
          eq(companies.subscriptionStatus, 'active'),
          eq(companies.operationalStatus, 'active'),
        );
    const rentalAccess = user.role === 'company'
      ? eq(vehicles.companyId, companyId)
      : eq(rentals.renterId, user.id);
    const supportAccess = user.role === 'company'
      ? or(eq(supportTickets.userId, user.id), eq(supportTickets.companyId, companyId))
      : eq(supportTickets.userId, user.id);
    const now = new Date();
    const promotionAccess = user.role === 'company'
      ? eq(promotions.companyId, companyId)
      : and(eq(promotions.enabled, true), lte(promotions.startsAt, now), gte(promotions.endsAt, now));
    const serviceAccess = user.role === 'company'
      ? eq(premiumServices.companyId, companyId)
      : eq(premiumServices.active, true);

    const [vehicleRows, rentalRows, insuranceRows, kilometerPolicyRows, promotionRows, serviceRows, supportRows] = await Promise.all([
      db.select({ vehicle: vehicles, companyName: companies.name }).from(vehicles)
        .innerJoin(companies, eq(vehicles.companyId, companies.id)).where(vehicleAccess),
      db.select({
        rental: rentals,
        make: vehicles.make,
        model: vehicles.model,
        year: vehicles.year,
        licensePlate: vehicles.licensePlate,
        vehicleCompanyId: vehicles.companyId,
        companyName: companies.name,
        customerName: users.name,
        customerEmail: users.email,
      }).from(rentals)
        .innerJoin(vehicles, eq(rentals.vehicleId, vehicles.id))
        .innerJoin(companies, eq(vehicles.companyId, companies.id))
        .innerJoin(users, eq(rentals.renterId, users.id))
        .where(rentalAccess),
      user.role === 'company' ? db.select().from(insurancePackages)
        .where(eq(insurancePackages.companyId, companyId)) : Promise.resolve([]),
      user.role === 'company' ? db.select().from(kilometerPolicies)
        .where(eq(kilometerPolicies.companyId, companyId)) : Promise.resolve([]),
      db.select({ promotion: promotions, companyName: companies.name }).from(promotions)
        .innerJoin(companies, eq(promotions.companyId, companies.id)).where(and(promotionAccess, isNull(promotions.archivedAt))),
      db.select({ service: premiumServices, companyName: companies.name }).from(premiumServices)
        .innerJoin(companies, eq(premiumServices.companyId, companies.id)).where(serviceAccess),
      db.select({ ticket: supportTickets, requesterName: users.name, requesterEmail: users.email, companyName: companies.name })
        .from(supportTickets)
        .innerJoin(users, eq(supportTickets.userId, users.id))
        .leftJoin(companies, eq(supportTickets.companyId, companies.id))
        .where(supportAccess),
    ]);

    const rentalIds = rentalRows.map((row: any) => row.rental.id);
    const ticketIds = supportRows.map((row: any) => row.ticket.id);
    const [extras, messages, maintenanceRows, maintenanceCatalog] = await Promise.all([
      rentalIds.length ? db.select().from(rentalServices).where(inArray(rentalServices.rentalId, rentalIds)) : Promise.resolve([]),
      ticketIds.length ? db.select().from(supportMessages).where(inArray(supportMessages.ticketId, ticketIds)) : Promise.resolve([]),
      user.role === 'company' ? db.select({
        order: {
          id: maintenanceWorkOrders.id,
          vehicleId: maintenanceWorkOrders.vehicleId,
          title: maintenanceWorkOrders.title,
          description: maintenanceWorkOrders.description,
          status: maintenanceWorkOrders.status,
          priority: maintenanceWorkOrders.priority,
          dueAt: maintenanceWorkOrders.dueAt,
          dueOdometer: maintenanceWorkOrders.dueOdometer,
          scheduledAt: maintenanceWorkOrders.scheduledAt,
          vendor: maintenanceWorkOrders.vendor,
          cost: maintenanceWorkOrders.cost,
          notes: maintenanceWorkOrders.notes,
          completedOdometer: maintenanceWorkOrders.completedOdometer,
          waybillName: maintenanceWorkOrders.waybillName,
        },
        make: vehicles.make,
        model: vehicles.model,
        year: vehicles.year,
        licensePlate: vehicles.licensePlate,
        image: vehicles.image,
        odometer: vehicles.odometer,
      }).from(maintenanceWorkOrders)
        .innerJoin(vehicles, eq(maintenanceWorkOrders.vehicleId, vehicles.id))
        .where(eq(maintenanceWorkOrders.companyId, companyId)) : Promise.resolve([]),
      user.role === 'company' ? db.select().from(maintenanceItems)
        .where(eq(maintenanceItems.companyId, companyId)) : Promise.resolve([]),
    ]);

    const candidates: Candidate[] = [];
    for (const row of vehicleRows as any[]) {
      const vehicle = row.vehicle;
      const code = reference('VEH', vehicle.id, 4);
      add(candidates, {
        id: vehicle.id,
        kind: 'vehicle',
        code,
        title: `${vehicle.make} ${vehicle.model}`,
        subtitle: `${vehicle.year} · ${vehicle.licensePlate} · ${row.companyName}`,
        href: user.role === 'company' ? `/dashboard/vehicles/${vehicle.id}` : `/dashboard/browse/${vehicle.id}`,
        status: vehicle.status,
        amount: Number(vehicle.dailyRate),
        amountType: 'perDay',
        image: vehicle.image,
      }, [
        [`vehicle ${vehicle.id} vehicle id ${vehicle.id} car ${vehicle.id} fleet ${vehicle.id} سيارة ${vehicle.id} مركبة ${vehicle.id}`, 1.55],
        [vehicle.licensePlate, 1.5], [vehicle.vin, 1.5], [vehicle.make, 1.25], [vehicle.model, 1.25], [vehicle.trim, 1.1],
        [vehicle.year, 1], [vehicle.category, 1], [vehicle.bodyType, 1], [vehicle.gearbox, 1],
        [vehicle.drivetrain, 1], [vehicle.steeringType, 1], [vehicle.fuel, 1], [vehicle.color, 1], [vehicle.location, 1],
        [JSON.stringify(vehicle.pickupLocations || ''), 1.25],
        [Array.isArray(vehicle.features) ? vehicle.features.join(' ') : '', 1], [vehicle.status, 1], [vehicle.odometer, 1], [vehicle.fuelLevel, 1],
        [vehicle.fuelPolicy, 1], [vehicle.insuranceCoverage, 1.25], [vehicle.insuranceProvider, 1.25],
        [vehicle.insurancePolicyNumber, 1.5], [vehicle.insurancePolicyExpiry, 1], [vehicle.insuranceDeductible, 1],
        [vehicle.dailyKilometerAllowance, 1], [vehicle.excessKilometerRate, 1],
        [JSON.stringify(vehicle.protectionPackages || ''), 1.15], [row.companyName, 1],
        [`daily rate ${currencyFields(vehicle.dailyRate).join(' ')} daily price ${currencyFields(vehicle.dailyRate).join(' ')} السعر اليومي ${currencyFields(vehicle.dailyRate).join(' ')}`, 1.3],
        ...currencyFields(vehicle.hourlyRate).map(value => [value, 1] as [unknown, number]),
        ...currencyFields(vehicle.dailyRate).map(value => [value, 1.2] as [unknown, number]),
        ...currencyFields(vehicle.weeklyRate).map(value => [value, 1] as [unknown, number]),
        ...currencyFields(vehicle.monthlyRate).map(value => [value, 1] as [unknown, number]),
      ]);
    }

    for (const row of rentalRows as any[]) {
      const rental = row.rental;
      const code = reference('FF', rental.id, 4);
      const rentalExtras = (extras as any[]).filter(extra => extra.rentalId === rental.id);
      add(candidates, {
        id: rental.id,
        kind: 'rental',
        code,
        title: `${row.make} ${row.model}`,
        subtitle: user.role === 'company'
          ? `${row.customerName} · ${row.licensePlate}`
          : `${row.companyName} · ${row.licensePlate}`,
        href: `/dashboard/rentals?booking=${rental.id}`,
        status: rental.status,
        amount: Number(rental.total),
        amountType: 'total',
      }, [
        [`booking ${rental.id} booking id ${rental.id} rental ${rental.id} reservation ${rental.id} invoice ${rental.id} bill ${rental.id} حجز ${rental.id} إيجار ${rental.id} فاتورة ${rental.id}`, 1.55],
        [`vehicle ${rental.vehicleId} ${reference('VEH', rental.vehicleId, 4)}`, 1.2],
        [row.licensePlate, 1.45], [row.make, 1.2], [row.model, 1.2], [row.customerName, 1.2],
        [row.customerEmail, 1.15], [row.companyName, 1], [rental.status, 1],
        [rental.pickupCity, 1.15], [rental.pickupLocation, 1.15], [rental.returnCity, 1.15], [rental.returnLocation, 1.15],
        [rental.promoCode, 1.2], [rental.rateType, 1], [rental.quantity, 1],
        [rental.protectionPackageId, 1.1], [rental.protectionTier, 1.3], [rental.protectionName, 1.3], [JSON.stringify(rental.protectionCoverage || ''), 1.15],
        [rental.protectionDeductible, 1], [rental.protectionSubtotal, 1], [rental.allowedKilometers, 1],
        [rental.pickupOdometer, 1], [rental.returnOdometer, 1], [rental.pickupFuelLevel, 1],
        [rental.returnFuelLevel, 1], [rental.fuelCharge, 1.1], [rental.excessKilometerRate, 1], [rental.excessDistanceCharge, 1.1],
        [rentalExtras.map(extra => `${extra.name} ${extra.days} ${extra.unitPrice} ${extra.subtotal}`).join(' '), 1],
        [`total amount ${currencyFields(rental.total).join(' ')} invoice total ${currencyFields(rental.total).join(' ')} إجمالي ${currencyFields(rental.total).join(' ')}`, 1.45],
        ...currencyFields(rental.total).map(value => [value, 1.35] as [unknown, number]),
        ...currencyFields(rental.subtotal).map(value => [value, 1] as [unknown, number]),
        ...currencyFields(rental.extrasSubtotal).map(value => [value, 1] as [unknown, number]),
        ...currencyFields(rental.discount).map(value => [value, 1] as [unknown, number]),
        ...dateFields(rental.startsAt).map(value => [value, 0.9] as [unknown, number]),
        ...dateFields(rental.endsAt).map(value => [value, 0.9] as [unknown, number]),
      ]);
    }

    for (const row of maintenanceRows as any[]) {
      const order = row.order;
      const code = reference('MWO', order.id, 5);
      add(candidates, {
        id: order.id,
        kind: 'maintenance',
        code,
        title: order.title,
        subtitle: `${row.make} ${row.model} · ${row.licensePlate}${order.vendor ? ` · ${order.vendor}` : ''}`,
        href: `/dashboard/maintenance?workOrder=${order.id}`,
        status: order.status,
        amount: Number(order.cost) > 0 ? Number(order.cost) : undefined,
        amountType: 'cost',
        image: row.image,
      }, [
        [`maintenance ${order.id} maintenance id ${order.id} work order ${order.id} workshop ${order.id} صيانة ${order.id} ورشة ${order.id}`, 1.55],
        [`vehicle ${order.vehicleId} ${reference('VEH', order.vehicleId, 4)}`, 1.25],
        [row.licensePlate, 1.45], [row.make, 1.15], [row.model, 1.15], [order.description, 1],
        [order.status, 1], [order.priority, 1], [order.vendor, 1.15], [order.notes, 1],
        [order.waybillName, 1.15], [order.dueOdometer, 1], [order.completedOdometer, 1],
        [`maintenance cost ${currencyFields(order.cost).join(' ')} total cost ${currencyFields(order.cost).join(' ')} تكلفة ${currencyFields(order.cost).join(' ')}`, 1.4],
        ...currencyFields(order.cost).map(value => [value, 1.35] as [unknown, number]),
        ...dateFields(order.dueAt).map(value => [value, 0.9] as [unknown, number]),
        ...dateFields(order.scheduledAt).map(value => [value, 0.9] as [unknown, number]),
      ]);
    }

    for (const item of maintenanceCatalog as any[]) {
      const code = reference('MNT', item.id, 4);
      add(candidates, {
        id: item.id,
        kind: 'maintenance_item',
        code,
        title: item.name,
        subtitle: item.description,
        href: `/dashboard/maintenance?catalog=${item.id}`,
        status: item.active ? 'active' : 'paused',
      }, [
        [`maintenance item ${item.id} maintenance item id ${item.id} catalog ${item.id} task ${item.id} بند صيانة ${item.id} مهمة ${item.id}`, 1.45],
        [item.key, 1.35], [item.description, 1], [item.intervalDays, 1], [item.intervalKm, 1],
      ]);
    }

    for (const insurance of insuranceRows as any[]) {
      const code = reference('INS', insurance.id, 4);
      add(candidates, {
        id: insurance.id,
        kind: 'insurance',
        code,
        title: insurance.name,
        subtitle: `${insurance.tier} · ${insurance.appliesTo === 'all' ? 'Whole fleet' : 'Selected vehicles'} · ${insurance.coverage.join(', ')}`,
        href: `/dashboard/insurance?package=${insurance.id}`,
        status: insurance.active ? 'active' : 'paused',
        amount: Number(insurance.dailyPrice),
        amountType: 'perDay',
      }, [
        [`insurance ${insurance.id} insurance package ${insurance.id} protection ${insurance.id} تأمين ${insurance.id} حماية ${insurance.id}`, 1.55],
        [insurance.name, 1.45], [insurance.tier, 1.25], [insurance.description, 1.1],
        [insurance.coverage.join(' '), 1.25], [insurance.appliesTo, 1], [insurance.deductible, 1.15],
        [`daily price ${currencyFields(insurance.dailyPrice).join(' ')} deductible ${currencyFields(insurance.deductible).join(' ')}`, 1.35],
        ...currencyFields(insurance.dailyPrice).map(value => [value, 1.3] as [unknown, number]),
        ...currencyFields(insurance.deductible).map(value => [value, 1.15] as [unknown, number]),
      ]);
    }

    for (const policy of kilometerPolicyRows as any[]) {
      const code = reference('KMP', policy.id, 4);
      add(candidates, {
        id:policy.id,
        kind:'kilometer_policy',
        code,
        title:policy.name,
        subtitle:`${policy.dailyKilometerAllowance} km/day · ${currencyFields(policy.excessKilometerRate)[0]}/excess km · ${policy.appliesTo === 'all' ? 'Whole fleet' : 'Selected vehicles'}`,
        href:'/dashboard/policies',
        status:policy.active ? 'active' : 'paused',
        amount:Number(policy.excessKilometerRate),
        amountType:'perKm',
      }, [
        [`mileage policy ${policy.id} kilometer policy ${policy.id} policy ${policy.id} سياسة مسافة ${policy.id}`,1.55],
        [policy.name,1.45],[policy.description,1.15],[policy.dailyKilometerAllowance,1.3],
        [policy.excessKilometerRate,1.3],[policy.appliesTo,1],
      ]);
    }

    for (const row of promotionRows as any[]) {
      const promotion = row.promotion;
      const code = reference('PRM', promotion.id, 4);
      add(candidates, {
        id: promotion.id,
        kind: 'promotion',
        code,
        title: promotion.name,
        subtitle: `${promotion.code} · ${promotion.type === 'percentage' ? `${promotion.value}%` : `$${Number(promotion.value).toFixed(2)}`} · ${row.companyName}`,
        href: user.role === 'company' ? `/dashboard/promotions?promotion=${promotion.id}` : `/dashboard/browse?promotion=${encodeURIComponent(promotion.code)}`,
        status: promotion.enabled ? 'active' : 'paused',
        amount: promotion.type === 'fixed' ? Number(promotion.value) : undefined,
        amountType: 'discount',
      }, [
        [`promotion ${promotion.id} promotion id ${promotion.id} promo ${promotion.id} coupon ${promotion.id} عرض ${promotion.id} خصم ${promotion.id}`, 1.45],
        [promotion.code, 1.6], [promotion.type, 1], [promotion.value, 1.25], [row.companyName, 1],
        [promotion.appliesTo, 1], [promotion.redemptions, 1],
        [`promotion discount value ${promotion.type === 'percentage' ? `${promotion.value}%` : currencyFields(promotion.value).join(' ')} قيمة الخصم ${promotion.type === 'percentage' ? `${promotion.value}%` : currencyFields(promotion.value).join(' ')}`, 1.35],
        ...(promotion.type === 'fixed' ? currencyFields(promotion.value).map(value => [value, 1.3] as [unknown, number]) : [[`${promotion.value}%`, 1.3] as [unknown, number]]),
        ...dateFields(promotion.startsAt).map(value => [value, 0.8] as [unknown, number]),
        ...dateFields(promotion.endsAt).map(value => [value, 0.8] as [unknown, number]),
      ]);
    }

    for (const row of serviceRows as any[]) {
      const service = row.service;
      const code = reference('SVC', service.id, 4);
      add(candidates, {
        id: service.id,
        kind: 'service',
        code,
        title: service.name,
        subtitle: `${service.description} · ${row.companyName}`,
        href: user.role === 'company' ? `/dashboard/services?service=${service.id}` : `/dashboard/browse?service=${service.id}&company=${service.companyId}`,
        status: service.active ? 'active' : 'paused',
        amount: Number(service.dailyPrice),
        amountType: 'perDay',
      }, [
        [`service ${service.id} service id ${service.id} premium service ${service.id} addon ${service.id} خدمة ${service.id}`, 1.5],
        [service.key, 1.4], [service.description, 1], [row.companyName, 1],
        [`service price ${currencyFields(service.dailyPrice).join(' ')} daily price ${currencyFields(service.dailyPrice).join(' ')} سعر الخدمة ${currencyFields(service.dailyPrice).join(' ')}`, 1.4],
        ...currencyFields(service.dailyPrice).map(value => [value, 1.35] as [unknown, number]),
      ]);
    }

    for (const row of supportRows as any[]) {
      const ticket = row.ticket;
      const code = reference('SUP', ticket.id, 4);
      const ticketMessages = (messages as any[]).filter(message => message.ticketId === ticket.id);
      add(candidates, {
        id: ticket.id,
        kind: 'support',
        code,
        title: ticket.subject,
        subtitle: `${row.requesterName}${row.companyName ? ` · ${row.companyName}` : ''}${ticket.rentalId ? ` · ${reference('FF', ticket.rentalId, 4)}` : ''}`,
        href: `/dashboard/support?conversation=${ticket.id}`,
        status: ticket.status,
      }, [
        [`support ${ticket.id} support id ${ticket.id} ticket ${ticket.id} conversation ${ticket.id} دعم ${ticket.id} تذكرة ${ticket.id}`, 1.55],
        [ticket.category, 1], [ticket.priority, 1], [ticket.status, 1], [ticket.rentalId, 1.15],
        [row.requesterName, 1.2], [row.requesterEmail, 1.1], [row.companyName, 1],
        [ticketMessages.map(message => message.body).join(' '), 1.05],
        ...dateFields(ticket.updatedAt).map(value => [value, 0.8] as [unknown, number]),
      ]);
    }

    const ranked = candidates
      .map(candidate => ({ candidate, score: score(candidate, query) }))
      .filter(entry => entry.score > 0)
      .sort((left, right) => right.score - left.score || left.candidate.title.localeCompare(right.candidate.title));
    const groups = ranked.reduce<Record<string, number>>((counts, entry) => {
      counts[entry.candidate.kind] = (counts[entry.candidate.kind] || 0) + 1;
      return counts;
    }, {});
    const results = ranked.slice(0, limit).map(({ candidate }) => {
      const { fields: _fields, ...result } = candidate;
      return result;
    });

    return ok({ query, results, total: ranked.length, groups });
  } catch (error) {
    return fail(error);
  }
}
