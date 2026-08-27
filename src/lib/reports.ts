import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { companies, maintenanceWorkOrders, rentals, users, vehicleConditionLogs, vehicles } from '@/db/schema';
import { annotateRefueling, canonicalOdometer, fuelEfficiencyAnalytics } from './telemetry';

export type ReportType = 'company' | 'rental_history' | 'vehicle' | 'customer';
export type ReportFilters = {
  start: Date;
  end: Date;
  vehicleId?: number | null;
  customerId?: number | null;
  type: ReportType;
};

const reportTypes:ReportType[] = ['company','rental_history','vehicle','customer'];
export function parseReportFilters(request:Request):ReportFilters {
  const url = new URL(request.url);
  const now = new Date();
  const startValue = url.searchParams.get('start') || `${now.getUTCFullYear()}-01-01`;
  const endValue = url.searchParams.get('end') || now.toISOString().slice(0,10);
  const start = new Date(`${startValue}T00:00:00.000Z`);
  const end = new Date(`${endValue}T23:59:59.999Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) throw new Error('Choose a valid report period.');
  if (end.getTime() - start.getTime() > 5 * 366 * 86_400_000) throw new Error('Report periods cannot exceed five years.');
  const requestedType = url.searchParams.get('type') as ReportType;
  const type = reportTypes.includes(requestedType) ? requestedType : 'company';
  const vehicleId = Number(url.searchParams.get('vehicleId')) || null;
  const customerId = Number(url.searchParams.get('customerId')) || null;
  if (type === 'vehicle' && !vehicleId) throw new Error('Choose a vehicle for the detailed vehicle report.');
  if (type === 'customer' && !customerId) throw new Error('Choose a customer for the detailed customer report.');
  return { start, end, type, vehicleId, customerId };
}

type SessionUser = { id:number; name:string; email:string; role:'company'|'renter'|'platform_admin'; companyId?:number|null; companyName?:string|null };
const DAY = 86_400_000;
const amount = (value:unknown) => Math.round(Number(value || 0) * 100) / 100;
const rentalDays = (row:any) => Math.max(1, Math.ceil((new Date(row.endsAt).getTime() - new Date(row.startsAt).getTime()) / DAY));
const rentalDistance = (row:any) => row.pickupOdometer == null || row.returnOdometer == null ? 0 : Math.max(0, Number(row.returnOdometer) - Number(row.pickupOdometer));
const inPeriod = (value:unknown, start:Date, end:Date) => {
  const time = new Date(value as any).getTime();
  return Number.isFinite(time) && time >= start.getTime() && time <= end.getTime();
};
const margin = (profit:number, revenue:number) => revenue > 0 ? amount(profit / revenue * 100) : 0;
const change = (current:number, previous:number) => previous === 0 ? (current === 0 ? 0 : 100) : amount((current - previous) / Math.abs(previous) * 100);
const monthKey = (value:Date|string) => {
  const date = new Date(value);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
};

function periodRows<T>(rows:T[], field:(row:T)=>unknown, start:Date, end:Date) {
  return rows.filter(row => inPeriod(field(row), start, end));
}

function summaryFor(rentalRows:any[], maintenanceRows:any[], fuelRows:any[]) {
  const billable = rentalRows.filter(row => row.status !== 'cancelled');
  const revenue = amount(billable.reduce((sum, row) => sum + Number(row.total || 0), 0));
  const maintenanceCost = amount(maintenanceRows.filter(row => row.status === 'completed').reduce((sum, row) => sum + Number(row.cost || 0), 0));
  const fuelCost = amount(fuelRows.reduce((sum, row) => sum + Number(row.fuelCost || 0), 0));
  const totalCost = amount(maintenanceCost + fuelCost);
  const profit = amount(revenue - totalCost);
  return {
    totalRentals: rentalRows.length,
    completedRentals: rentalRows.filter(row => row.status === 'completed').length,
    rentalRevenue: revenue,
    maintenanceCost,
    fuelCost,
    otherCost: 0,
    totalCost,
    netProfit: profit,
    profitMargin: margin(profit, revenue),
    rentalDays: billable.reduce((sum, row) => sum + rentalDays(row), 0),
    totalDistance: billable.reduce((sum, row) => sum + rentalDistance(row), 0),
  };
}

export async function loadOperationalReport(user:SessionUser, filters:ReportFilters) {
  if(user.role==='platform_admin')throw new Error('Operational reports are not available in the platform administration workspace.');
  const db = await getDb();
  const companyMode = user.role === 'company';
  // A renter has one personal dashboard, not access to the operational report
  // catalogue or company-oriented vehicle/customer scopes.
  if (!companyMode) filters = { ...filters, type:'company', vehicleId:null, customerId:null };
  const companyId = Number(user.companyId || 0);
  const [company] = companyMode ? await db.select().from(companies).where(eq(companies.id, companyId)).limit(1) : [];

  const allRentalRows:any[] = await db.select({
    id:rentals.id, vehicleId:rentals.vehicleId, renterId:rentals.renterId, status:rentals.status,
    startsAt:rentals.startsAt, endsAt:rentals.endsAt, rateType:rentals.rateType, quantity:rentals.quantity,
    subtotal:rentals.subtotal, promoCode:rentals.promoCode, discount:rentals.discount,
    loyaltyLevelName:rentals.loyaltyLevelName, loyaltyDiscountPercentage:rentals.loyaltyDiscountPercentage,
    loyaltyDiscount:rentals.loyaltyDiscount, loyaltyPointsRate:rentals.loyaltyPointsRate,
    loyaltyPointsEarned:rentals.loyaltyPointsEarned, extrasSubtotal:rentals.extrasSubtotal,
    extraDiscount:rentals.extraDiscount, protectionSubtotal:rentals.protectionSubtotal, protectionName:rentals.protectionName,
    fuelCharge:rentals.fuelCharge, excessDistanceCharge:rentals.excessDistanceCharge,
    total:rentals.total, pickupCity:rentals.pickupCity, pickupLocation:rentals.pickupLocation,
    returnCity:rentals.returnCity, returnLocation:rentals.returnLocation,
    bookingOdometer:rentals.bookingOdometer, renterOdometerAcknowledged:rentals.renterOdometerAcknowledged,
    dailyKilometerAllowance:rentals.dailyKilometerAllowance, allowedKilometers:rentals.allowedKilometers,
    excessKilometerRate:rentals.excessKilometerRate,
    pickupOdometer:rentals.pickupOdometer, returnOdometer:rentals.returnOdometer,
    pickupFuelLevel:rentals.pickupFuelLevel, returnFuelLevel:rentals.returnFuelLevel,
    make:vehicles.make, model:vehicles.model, year:vehicles.year, licensePlate:vehicles.licensePlate,
    vehicleCompanyId:vehicles.companyId, customer:users.name, customerEmail:users.email,
  }).from(rentals).innerJoin(vehicles, eq(rentals.vehicleId, vehicles.id)).innerJoin(users, eq(rentals.renterId, users.id));

  const accessibleRentals = allRentalRows.filter(row => companyMode ? row.vehicleCompanyId === companyId : row.renterId === user.id);
  const accessibleVehicleIds = new Set(accessibleRentals.map(row => row.vehicleId));
  const allVehicles:any[] = (await db.select().from(vehicles)).filter((vehicle:any) => companyMode ? vehicle.companyId === companyId : accessibleVehicleIds.has(vehicle.id));
  const customerMap = new Map<number, {id:number;name:string;email:string}>();
  accessibleRentals.forEach(row => customerMap.set(row.renterId, { id:row.renterId, name:row.customer, email:row.customerEmail }));
  const customerOptions = companyMode ? [...customerMap.values()].sort((a,b) => a.name.localeCompare(b.name)) : [{ id:user.id, name:user.name, email:user.email }];

  if (filters.vehicleId && !allVehicles.some(vehicle => vehicle.id === filters.vehicleId)) throw new Error('The selected vehicle is not available for this report.');
  if (filters.customerId && !customerOptions.some(customer => customer.id === filters.customerId)) throw new Error('The selected customer is not available for this report.');

  const allMaintenance:any[] = companyMode ? (await db.select({
    id:maintenanceWorkOrders.id, vehicleId:maintenanceWorkOrders.vehicleId, title:maintenanceWorkOrders.title,
    description:maintenanceWorkOrders.description, status:maintenanceWorkOrders.status, priority:maintenanceWorkOrders.priority,
    scheduledAt:maintenanceWorkOrders.scheduledAt, completedAt:maintenanceWorkOrders.completedAt,
    completedOdometer:maintenanceWorkOrders.completedOdometer, dueOdometer:maintenanceWorkOrders.dueOdometer,
    vendor:maintenanceWorkOrders.vendor, cost:maintenanceWorkOrders.cost, notes:maintenanceWorkOrders.notes,
    make:vehicles.make, model:vehicles.model, licensePlate:vehicles.licensePlate,
  }).from(maintenanceWorkOrders).innerJoin(vehicles, eq(maintenanceWorkOrders.vehicleId, vehicles.id))
    .where(eq(maintenanceWorkOrders.companyId, companyId))) : [];

  const allConditionLogs:any[] = companyMode ? await db.select({
    id:vehicleConditionLogs.id, vehicleId:vehicleConditionLogs.vehicleId, rentalId:vehicleConditionLogs.rentalId,
    recordedBy:vehicleConditionLogs.recordedBy, eventType:vehicleConditionLogs.eventType,
    odometer:vehicleConditionLogs.odometer, fuelLevel:vehicleConditionLogs.fuelLevel,
    fuelAddedLiters:vehicleConditionLogs.fuelAddedLiters, fuelCost:vehicleConditionLogs.fuelCost,
    notes:vehicleConditionLogs.notes, createdAt:vehicleConditionLogs.createdAt,
    make:vehicles.make, model:vehicles.model, licensePlate:vehicles.licensePlate,
    employee:users.name,
  }).from(vehicleConditionLogs).innerJoin(vehicles, eq(vehicleConditionLogs.vehicleId, vehicles.id))
    .leftJoin(users, eq(vehicleConditionLogs.recordedBy, users.id))
    .where(eq(vehicleConditionLogs.companyId, companyId)) : [];

  const filterRental = (row:any, start:Date, end:Date) => inPeriod(row.startsAt, start, end)
    && (!filters.vehicleId || row.vehicleId === filters.vehicleId)
    && (!filters.customerId || row.renterId === filters.customerId);
  const currentRentals = accessibleRentals.filter(row => filterRental(row, filters.start, filters.end));
  const scopedVehicleIds = new Set(filters.vehicleId
    ? [filters.vehicleId]
    : filters.customerId ? currentRentals.map(row => row.vehicleId) : allVehicles.map(vehicle => vehicle.id));
  const effectiveVehicleScope = scopedVehicleIds.size ? scopedVehicleIds : new Set(allVehicles.map(vehicle => vehicle.id));
  const maintenanceDate = (row:any) => row.completedAt || row.scheduledAt;
  const currentMaintenance = periodRows(allMaintenance, maintenanceDate, filters.start, filters.end)
    .filter((row:any) => effectiveVehicleScope.has(row.vehicleId));
  const periodLogs = periodRows(allConditionLogs, (row:any) => row.createdAt, filters.start, filters.end)
    .filter((row:any) => effectiveVehicleScope.has(row.vehicleId));
  const fueling = periodLogs.filter((row:any) => row.eventType === 'refuel');
  const fuelAnnotations = annotateRefueling(allConditionLogs);
  const measuredFuelRows = fueling.filter((row:any) => fuelAnnotations.has(row.id));
  const measuredFueling = measuredFuelRows.map((row:any) => fuelAnnotations.get(row.id)!);
  const measuredFuelDistance = measuredFueling.reduce((sum:number, interval:any) => sum + interval.distanceSincePreviousFuel, 0);
  const measuredFuelCost = measuredFuelRows.reduce((sum:number, row:any) => sum + Number(row.fuelCost || 0), 0);
  const measuredFuelLiters = measuredFuelRows.reduce((sum:number, row:any) => sum + Number(row.fuelAddedLiters || 0), 0);
  const odometer = periodLogs.slice().sort((a:any,b:any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  const duration = filters.end.getTime() - filters.start.getTime() + 1;
  const previousEnd = new Date(filters.start.getTime() - 1);
  const previousStart = new Date(previousEnd.getTime() - duration + 1);
  const previousRentals = accessibleRentals.filter(row => filterRental(row, previousStart, previousEnd));
  const previousVehicleIds = new Set(filters.vehicleId
    ? [filters.vehicleId]
    : filters.customerId ? previousRentals.map(row => row.vehicleId) : allVehicles.map(vehicle => vehicle.id));
  const previousScope = previousVehicleIds.size ? previousVehicleIds : effectiveVehicleScope;
  const previousMaintenance = periodRows(allMaintenance, maintenanceDate, previousStart, previousEnd).filter((row:any) => previousScope.has(row.vehicleId));
  const previousFuel = periodRows(allConditionLogs.filter((row:any) => row.eventType === 'refuel'), (row:any) => row.createdAt, previousStart, previousEnd).filter((row:any) => previousScope.has(row.vehicleId));

  const summary:any = summaryFor(currentRentals, currentMaintenance, fueling);
  const previous = summaryFor(previousRentals, previousMaintenance, previousFuel);
  summary.activeVehicles = allVehicles.filter(vehicle => vehicle.status !== 'retired' && effectiveVehicleScope.has(vehicle.id)).length;
  summary.customerCount = new Set(currentRentals.map(row => row.renterId)).size;
  summary.maintenanceJobs = currentMaintenance.length;
  summary.fuelingEvents = fueling.length;
  summary.measuredFuelDistance = measuredFuelDistance;
  summary.totalSpent = amount(currentRentals.filter(row => row.status === 'completed').reduce((sum, row) => sum + Number(row.total || 0), 0));
  summary.fuelCostPerKm = measuredFuelDistance > 0 ? amount(measuredFuelCost / measuredFuelDistance) : 0;
  summary.fuelLitersPer100Km = measuredFuelDistance > 0 ? amount(measuredFuelLiters / measuredFuelDistance * 100) : 0;
  summary.changes = {
    rentals:change(summary.totalRentals, previous.totalRentals),
    revenue:change(summary.rentalRevenue, previous.rentalRevenue),
    cost:change(summary.totalCost, previous.totalCost),
    profit:change(summary.netProfit, previous.netProfit),
  };

  const monthMap = new Map<string, any>();
  const cursor = new Date(Date.UTC(filters.start.getUTCFullYear(), filters.start.getUTCMonth(), 1));
  const lastMonth = new Date(Date.UTC(filters.end.getUTCFullYear(), filters.end.getUTCMonth(), 1));
  while (cursor <= lastMonth) {
    const key = monthKey(cursor);
    monthMap.set(key, { key, monthStart:cursor.toISOString(), rentals:0, revenue:0, spent:0, maintenanceCost:0, fuelCost:0, cost:0, profit:0, margin:0 });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  currentRentals.filter(row => row.status !== 'cancelled').forEach(row => { const month=monthMap.get(monthKey(row.startsAt)); if(month){month.rentals++;month.revenue+=Number(row.total||0);if(row.status==='completed')month.spent+=Number(row.total||0);} });
  currentMaintenance.filter((row:any) => row.status === 'completed').forEach((row:any) => { const month=monthMap.get(monthKey(maintenanceDate(row))); if(month)month.maintenanceCost+=Number(row.cost||0); });
  fueling.forEach((row:any) => { const month=monthMap.get(monthKey(row.createdAt)); if(month)month.fuelCost+=Number(row.fuelCost||0); });
  const monthly = [...monthMap.values()].map(month => {
    month.revenue=amount(month.revenue);month.spent=amount(month.spent);month.maintenanceCost=amount(month.maintenanceCost);month.fuelCost=amount(month.fuelCost);
    month.cost=amount(month.maintenanceCost+month.fuelCost);month.profit=amount(month.revenue-month.cost);month.margin=margin(month.profit,month.revenue);return month;
  });

  const vehicleRows = allVehicles.filter(vehicle => !filters.vehicleId || vehicle.id === filters.vehicleId).map(vehicle => {
    const vehicleRentals=currentRentals.filter(row=>row.vehicleId===vehicle.id), vehicleMaintenance=currentMaintenance.filter((row:any)=>row.vehicleId===vehicle.id), vehicleFuel=fueling.filter((row:any)=>row.vehicleId===vehicle.id);
    const stats:any=summaryFor(vehicleRentals,vehicleMaintenance,vehicleFuel);
    const vehicleLogs=allConditionLogs.filter((row:any)=>row.vehicleId===vehicle.id);
    const efficiency=fuelEfficiencyAnalytics(vehicle,vehicleLogs);
    return { id:vehicle.id, make:vehicle.make, model:vehicle.model, year:vehicle.year, licensePlate:vehicle.licensePlate, vin:(vehicle as any).vin||'', status:vehicle.status, currentOdometer:canonicalOdometer(vehicle.odometer,vehicleLogs), currentFuelLevel:vehicle.fuelLevel, fuelEfficiency:efficiency, ...stats };
  }).filter(row => !filters.customerId || row.totalRentals > 0).sort((a,b)=>b.netProfit-a.netProfit);

  const customerRows = customerOptions.map(customer => {
    const rows=currentRentals.filter(row=>row.renterId===customer.id), stats=summaryFor(rows,[],[]);
    return { ...customer, rentals:stats.totalRentals, rentalDays:stats.rentalDays, distance:stats.totalDistance, revenue:stats.rentalRevenue };
  }).filter(customer=>!filters.customerId||customer.id===filters.customerId).filter(customer=>customer.rentals>0).sort((a,b)=>b.revenue-a.revenue);

  const rentalsDetailed = currentRentals.slice().sort((a,b)=>new Date(a.startsAt).getTime()-new Date(b.startsAt).getTime()).map(row => ({
    ...row, contract:`R-${String(row.id).padStart(6,'0')}`, days:rentalDays(row), distance:rentalDistance(row),
  }));
  const maintenanceDetailed = currentMaintenance.slice().sort((a:any,b:any)=>new Date(maintenanceDate(a)).getTime()-new Date(maintenanceDate(b)).getTime()).map((row:any)=>({ ...row, serviceDate:maintenanceDate(row) }));
  const fuelingDetailed = fueling.slice().sort((a:any,b:any)=>new Date(a.createdAt).getTime()-new Date(b.createdAt).getTime()).map((row:any)=>({
    ...row, liters:amount(row.fuelAddedLiters), cost:amount(row.fuelCost), pricePerLiter:Number(row.fuelAddedLiters)>0?amount(Number(row.fuelCost||0)/Number(row.fuelAddedLiters)):0,
    distanceSincePreviousFuel:fuelAnnotations.get(row.id)?.distanceSincePreviousFuel || 0,
    costPerKm:fuelAnnotations.get(row.id)?.costPerKm || 0,
    litersPer100Km:fuelAnnotations.get(row.id)?.litersPer100Km || 0,
  }));

  const selectedVehicle = filters.vehicleId ? allVehicles.find(vehicle=>vehicle.id===filters.vehicleId) : null;
  const selectedCustomer = filters.customerId ? customerOptions.find(customer=>customer.id===filters.customerId) : null;
  const startReading = odometer.length ? odometer[0].odometer : (selectedVehicle?.odometer || 0);
  const endReading = odometer.length ? odometer[odometer.length-1].odometer : (selectedVehicle?.odometer || 0);

  return {
    reportNumber:`RPT-${companyMode?`C${companyId}`:`U${user.id}`}-${filters.start.toISOString().slice(0,10).replaceAll('-','')}`,
    generatedAt:new Date().toISOString(),
    mode:companyMode?'company':'renter',
    currency:companyMode?(company?.baseCurrency||'USD'):'USD',
    reportType:filters.type,
    owner:{ name:companyMode?(company?.name||user.companyName||'Company'):user.name, city:companyMode?(company?.city||''):'', logo:companyMode?(company?.logo||'FF'):'FF', email:user.email },
    period:{ start:filters.start.toISOString(), end:filters.end.toISOString(), previousStart:previousStart.toISOString(), previousEnd:previousEnd.toISOString() },
    appliedFilters:{ vehicleId:filters.vehicleId||null, customerId:filters.customerId||null, vehicle:selectedVehicle?`${selectedVehicle.make} ${selectedVehicle.model} · ${selectedVehicle.licensePlate}`:null, customer:selectedCustomer?.name||null },
    options:{ vehicles:companyMode?allVehicles.map(vehicle=>({id:vehicle.id,label:`${vehicle.make} ${vehicle.model}`,licensePlate:vehicle.licensePlate})):[], customers:companyMode?customerOptions:[] },
    summary, monthly, vehicles:companyMode?vehicleRows:[], customers:companyMode?customerRows:[],
    rentals:rentalsDetailed, maintenance:companyMode?maintenanceDetailed:[], fueling:companyMode?fuelingDetailed:[], odometer:companyMode?odometer:[],
    vehicleDetail:selectedVehicle?{
      ...selectedVehicle,
      odometer:vehicleRows.find(row=>row.id===selectedVehicle.id)?.currentOdometer || selectedVehicle.odometer,
      fuelEfficiency:vehicleRows.find(row=>row.id===selectedVehicle.id)?.fuelEfficiency,
      vin:(selectedVehicle as any).vin||'', stats:vehicleRows.find(row=>row.id===selectedVehicle.id)||summary,
      usage:{ startOdometer:startReading, endOdometer:endReading, distance:Math.max(0,endReading-startReading), averageDistance:rentalsDetailed.length?amount(summary.totalDistance/rentalsDetailed.length):0 },
    }:null,
  };
}
