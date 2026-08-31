import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { companies, insurancePackages, insurancePackageVehicles, kilometerPolicies, kilometerPolicyVehicles, loyaltyLevels, loyaltyPointLedger, loyaltyPrograms, maintenanceItems, maintenanceWorkOrders, notifications, premiumServices, promotionVehicles, promotions, rentals, rentalServices, subscriptionPlans, supportMessages, supportTickets, userSettings, users, vehicleConditionLogs, vehicles } from './schema';
import { DEFAULT_MAINTENANCE_ITEMS } from '../lib/maintenance';
import { defaultProtectionPackages } from '../lib/insurance';
import { DEFAULT_LOYALTY_LEVELS } from '../lib/loyalty';

const at = (days: number, hour = 10) => {
  const value = new Date();
  value.setUTCHours(hour, 0, 0, 0);
  value.setUTCDate(value.getUTCDate() + days);
  return value;
};

export async function seedDatabase(db: any) {
  const passwordHash = await bcrypt.hash('demo1234', 10);
  const platformAdminPasswordHash = process.env.PLATFORM_ADMIN_PASSWORD
    ? await bcrypt.hash(process.env.PLATFORM_ADMIN_PASSWORD,10) : passwordHash;
  const plans = await db.select().from(subscriptionPlans);
  const growthPlan = plans.find((plan:any) => plan.code === 'GROWTH')!;
  const verifiedCompany = {
    verificationStatus:'verified' as const, verifiedAt:new Date(), subscriptionPlanId:growthPlan.id,
    subscriptionStatus:'active' as const, subscriptionStartedAt:new Date(), operationalStatus:'active' as const,
  };
  const [city, lux, eco] = await db.insert(companies).values([
    { name: 'CityDrive Rentals', slug: 'citydrive', logo: 'CD', city: 'San Francisco', ...verifiedCompany, whatsappNumbers: [] },
    { name: 'LuxWheels Premium', slug: 'luxwheels', logo: 'LW', city: 'Los Angeles', ...verifiedCompany, whatsappNumbers: [] },
    { name: 'EcoMotion EV', slug: 'ecomotion', logo: 'EM', city: 'San Francisco', ...verifiedCompany, whatsappNumbers: [] },
  ]).returning();

  const seededUsers = await db.insert(users).values([
    { name: 'Alex Morgan', email: 'alex@demo.com', passwordHash, role: 'renter', phone: '+1 415 555 0142', avatar: 'AM' },
    { name: 'Sara Lee', email: 'sara@demo.com', passwordHash, role: 'renter', phone: '+1 628 555 0177', avatar: 'SL' },
    { name: 'Maya Chen', email: 'maya@demo.com', passwordHash, role: 'renter', phone: '+1 510 555 0130', avatar: 'MC' },
    { name: 'James Wilson', email: 'james@demo.com', passwordHash, role: 'renter', phone: '+1 707 555 0161', avatar: 'JW' },
    { name: 'Olivia Martin', email: 'citydrive@demo.com', passwordHash, role: 'company', companyId: city.id, phone: '+1 415 555 0101', avatar: 'OM' },
    { name: 'Daniel Laurent', email: 'luxwheels@demo.com', passwordHash, role: 'company', companyId: lux.id, phone: '+1 310 555 0102', avatar: 'DL' },
    { name: 'Nora Green', email: 'ecomotion@demo.com', passwordHash, role: 'company', companyId: eco.id, phone: '+1 650 555 0103', avatar: 'NG' },
    { name: 'FleetFlow Platform Admin', email: process.env.PLATFORM_ADMIN_EMAIL || 'admin@fleetflow.com', passwordHash:platformAdminPasswordHash, role: 'platform_admin', avatar: 'PA' },
  ]).returning();
  const [alex, sara, maya, james, olivia] = seededUsers;
  await db.insert(userSettings).values(seededUsers.map((user: any) => ({ userId: user.id })));
  const loyaltyProgramRows = await db.insert(loyaltyPrograms).values([
    { companyId:city.id, enabled:true, pointsPerCurrency:1 },
    { companyId:lux.id, enabled:false, pointsPerCurrency:1 },
    { companyId:eco.id, enabled:false, pointsPerCurrency:1 },
  ]).returning();
  await db.insert(loyaltyLevels).values(loyaltyProgramRows.flatMap((program:any) => DEFAULT_LOYALTY_LEVELS.map(level => ({ programId:program.id, ...level }))));

  const fleet = await db.insert(vehicles).values([
    { companyId: city.id, make:'Mercedes-Benz', model:'C-Class', trim:'C 300', bodyType:'Sedan', drivetrain:'RWD', steeringType:'Left-hand drive', year:2025, category:'Luxury sedan', gearbox:'Automatic', fuel:'Hybrid', seats:5, color:'Graphite', licensePlate:'CD-4821', odometer:8420, location:'SoMa, San Francisco', features:['GPS','Heated seats','Apple CarPlay'], image:'/cars/mercedes.jpg', status:'available', hourlyRate:18, dailyRate:139, weeklyRate:829, monthlyRate:2890, rating:4.9 },
    { companyId: city.id, make:'BMW', model:'5 Series', trim:'530e', bodyType:'Sedan', drivetrain:'AWD', steeringType:'Left-hand drive', year:2024, category:'Executive', gearbox:'Automatic', fuel:'Hybrid', seats:5, color:'Midnight blue', licensePlate:'CD-5912', odometer:12780, location:'Financial District', features:['GPS','Premium audio','360° camera'], image:'/cars/bmw.jpg', status:'available', hourlyRate:22, dailyRate:165, weeklyRate:990, monthlyRate:3450, rating:4.9 },
    { companyId: city.id, make:'Audi', model:'A6', trim:'Premium Plus', bodyType:'Sedan', drivetrain:'AWD', steeringType:'Left-hand drive', year:2025, category:'Executive', gearbox:'Automatic', fuel:'Hybrid', seats:5, color:'Silver', licensePlate:'CD-7740', odometer:4980, location:'SoMa, San Francisco', features:['Virtual cockpit','Adaptive cruise','CarPlay'], image:'/cars/audi.jpg', status:'available', hourlyRate:21, dailyRate:159, weeklyRate:949, monthlyRate:3290, rating:4.8 },
    { companyId: city.id, make:'Toyota', model:'Camry', trim:'XLE', bodyType:'Sedan', drivetrain:'FWD', steeringType:'Left-hand drive', year:2024, category:'Sedan', gearbox:'Automatic', fuel:'Hybrid', seats:5, color:'Pearl white', licensePlate:'CD-1418', odometer:18400, location:'SFO Airport', features:['CarPlay','Lane assist','Keyless entry'], image:'/cars/audi.jpg', status:'maintenance', hourlyRate:12, dailyRate:89, weeklyRate:529, monthlyRate:1840, rating:4.7 },
    { companyId: city.id, make:'Volvo', model:'XC60', trim:'Ultra', bodyType:'SUV', drivetrain:'AWD', steeringType:'Left-hand drive', year:2025, category:'Premium SUV', gearbox:'Automatic', fuel:'Hybrid', seats:5, color:'Sage', licensePlate:'CD-6024', odometer:6360, location:'Marina District', features:['Pilot assist','Panoramic roof','Heated seats'], image:'/cars/range-rover.jpg', status:'available', hourlyRate:19, dailyRate:145, weeklyRate:870, monthlyRate:3040, rating:4.9 },
    { companyId: city.id, make:'Ford', model:'Explorer', trim:'Limited', bodyType:'SUV', drivetrain:'AWD', steeringType:'Left-hand drive', year:2023, category:'SUV', gearbox:'Automatic', fuel:'Petrol', seats:7, color:'Black', licensePlate:'CD-8893', odometer:29400, location:'SFO Airport', features:['7 seats','GPS','Blind spot assist'], image:'/cars/range-rover.jpg', status:'retired', hourlyRate:15, dailyRate:115, weeklyRate:689, monthlyRate:2390, rating:4.5 },
    { companyId: lux.id, make:'Range Rover', model:'Velar', trim:'Dynamic SE', bodyType:'SUV', drivetrain:'AWD', steeringType:'Left-hand drive', year:2025, category:'Luxury SUV', gearbox:'Automatic', fuel:'Petrol', seats:5, color:'Forest green', licensePlate:'LW-3306', odometer:7420, location:'Beverly Hills', features:['Massage seats','Meridian audio','Panoramic roof'], image:'/cars/range-rover.jpg', status:'available', hourlyRate:29, dailyRate:219, weeklyRate:1310, monthlyRate:4590, rating:4.9 },
    { companyId: lux.id, make:'Mercedes-Benz', model:'S-Class', trim:'S 580e', bodyType:'Sedan', drivetrain:'RWD', steeringType:'Left-hand drive', year:2025, category:'Luxury sedan', gearbox:'Automatic', fuel:'Hybrid', seats:5, color:'Obsidian', licensePlate:'LW-8145', odometer:5100, location:'West Hollywood', features:['Chauffeur package','Burmester audio','Massage seats'], image:'/cars/mercedes.jpg', status:'available', hourlyRate:34, dailyRate:259, weeklyRate:1549, monthlyRate:5390, rating:5.0 },
    { companyId: lux.id, make:'BMW', model:'X7', trim:'xDrive40i', bodyType:'SUV', drivetrain:'AWD', steeringType:'Left-hand drive', year:2024, category:'Luxury SUV', gearbox:'Automatic', fuel:'Petrol', seats:7, color:'Alpine white', licensePlate:'LW-1039', odometer:11340, location:'LAX Airport', features:['7 seats','Sky lounge','Parking assist'], image:'/cars/bmw.jpg', status:'available', hourlyRate:31, dailyRate:235, weeklyRate:1409, monthlyRate:4890, rating:4.8 },
    { companyId: lux.id, make:'Porsche', model:'Panamera', trim:'4 E-Hybrid', bodyType:'Hatchback', drivetrain:'AWD', steeringType:'Left-hand drive', year:2025, category:'Performance', gearbox:'Automatic', fuel:'Hybrid', seats:4, color:'Chalk grey', licensePlate:'LW-9114', odometer:3300, location:'Beverly Hills', features:['Sport chrono','BOSE audio','Adaptive suspension'], image:'/cars/audi.jpg', status:'maintenance', hourlyRate:38, dailyRate:289, weeklyRate:1729, monthlyRate:5990, rating:5.0 },
    { companyId: lux.id, make:'Audi', model:'Q8', trim:'Premium Plus', bodyType:'SUV', drivetrain:'AWD', steeringType:'Left-hand drive', year:2024, category:'Luxury SUV', gearbox:'Automatic', fuel:'Petrol', seats:5, color:'Daytona grey', licensePlate:'LW-4480', odometer:15600, location:'Santa Monica', features:['Matrix LED','Bang & Olufsen','Air suspension'], image:'/cars/audi.jpg', status:'available', hourlyRate:28, dailyRate:209, weeklyRate:1250, monthlyRate:4350, rating:4.8 },
    { companyId: eco.id, make:'Tesla', model:'Model Y', trim:'Long Range', bodyType:'SUV', drivetrain:'AWD', steeringType:'Left-hand drive', year:2025, category:'Electric SUV', gearbox:'Automatic', fuel:'Electric', seats:5, color:'Pearl white', licensePlate:'EM-1708', odometer:6150, location:'Mission District', features:['Autopilot','Supercharger access','Glass roof'], image:'/cars/tesla.jpg', status:'available', hourlyRate:20, dailyRate:149, weeklyRate:899, monthlyRate:3190, rating:4.9 },
    { companyId: eco.id, make:'Tesla', model:'Model 3', trim:'Long Range', bodyType:'Sedan', drivetrain:'RWD', steeringType:'Left-hand drive', year:2024, category:'Electric sedan', gearbox:'Automatic', fuel:'Electric', seats:5, color:'Midnight grey', licensePlate:'EM-2264', odometer:19860, location:'Oakland Downtown', features:['Autopilot','Premium connectivity','Glass roof'], image:'/cars/tesla.jpg', status:'available', hourlyRate:17, dailyRate:129, weeklyRate:769, monthlyRate:2690, rating:4.8 },
    { companyId: eco.id, make:'Polestar', model:'2', trim:'Long Range Dual Motor', bodyType:'Hatchback', drivetrain:'AWD', steeringType:'Left-hand drive', year:2025, category:'Electric sedan', gearbox:'Automatic', fuel:'Electric', seats:5, color:'Snow', licensePlate:'EM-7202', odometer:4400, location:'SoMa, San Francisco', features:['Google built-in','Pilot pack','Harman Kardon'], image:'/cars/tesla.jpg', status:'available', hourlyRate:19, dailyRate:145, weeklyRate:869, monthlyRate:3020, rating:4.8 },
    { companyId: eco.id, make:'Kia', model:'EV9', trim:'GT-Line', bodyType:'SUV', drivetrain:'AWD', steeringType:'Left-hand drive', year:2025, category:'Electric SUV', gearbox:'Automatic', fuel:'Electric', seats:7, color:'Ocean blue', licensePlate:'EM-9009', odometer:2880, location:'SFO Airport', features:['7 seats','Vehicle-to-load','Highway assist'], image:'/cars/tesla.jpg', status:'available', hourlyRate:23, dailyRate:175, weeklyRate:1049, monthlyRate:3650, rating:4.9 },
    { companyId: eco.id, make:'Hyundai', model:'Ioniq 5', trim:'Limited', bodyType:'SUV', drivetrain:'RWD', steeringType:'Left-hand drive', year:2024, category:'Electric SUV', gearbox:'Automatic', fuel:'Electric', seats:5, color:'Digital teal', licensePlate:'EM-5055', odometer:13200, location:'Berkeley', features:['Ultra-fast charging','Vehicle-to-load','Relaxation seats'], image:'/cars/tesla.jpg', status:'maintenance', hourlyRate:16, dailyRate:119, weeklyRate:710, monthlyRate:2480, rating:4.7 },
    { companyId: eco.id, make:'BMW', model:'i5', trim:'M60', bodyType:'Sedan', drivetrain:'AWD', steeringType:'Left-hand drive', year:2025, category:'Electric sedan', gearbox:'Automatic', fuel:'Electric', seats:5, color:'Cape York green', licensePlate:'EM-5501', odometer:3750, location:'Palo Alto', features:['Driving assistant','Harman Kardon','Panoramic roof'], image:'/cars/bmw.jpg', status:'available', hourlyRate:26, dailyRate:195, weeklyRate:1169, monthlyRate:4090, rating:5.0 },
  ].map((vehicle, index) => {
    const insuranceDeductible = index % 3 === 0 ? 3000 : index % 3 === 1 ? 2000 : 1500;
    return {
      ...vehicle,
      vin: `WFF2026${String(index + 1).padStart(10, '0')}`,
      pickupLocations: vehicle.companyId === city.id
        ? [{ city:'San Francisco', site:vehicle.location }, { city:'Oakland', site:'Oakland Downtown Mobility Hub' }, ...(index % 2 === 0 ? [{ city:'San Jose', site:'San Jose Airport' }] : [])]
        : vehicle.companyId === lux.id
          ? [{ city:'Los Angeles', site:vehicle.location }, { city:'Beverly Hills', site:'Beverly Hills City Center' }, { city:'Santa Monica', site:'Santa Monica Downtown' }]
          : [{ city:'San Francisco', site:vehicle.location }, { city:'Oakland', site:'Oakland Downtown Mobility Hub' }, { city:'Berkeley', site:'Berkeley Mobility Center' }],
      fuelLevel: 55 + (index % 4) * 15,
      fuelPolicy: index % 3 === 1 ? 'full_to_full' as const : 'same_to_same' as const,
      dailyKilometerAllowance: index % 3 === 0 ? 200 : 250,
      excessKilometerRate: index % 3 === 0 ? 1.25 : 0.9,
      insuranceCoverage: index % 4 === 3 ? 'third_party' as const : 'comprehensive' as const,
      insuranceProvider: ['Tawuniya', 'Al Rajhi Takaful', 'MEDGULF'][index % 3],
      insurancePolicyNumber: `KSA-MOT-${20260000 + index + 1}`,
      insurancePolicyExpiry: at(210 + index * 4),
      insuranceDeductible,
      protectionPackages: defaultProtectionPackages(insuranceDeductible).map((pkg, packageIndex) => ({
        ...pkg,
        dailyPrice: pkg.dailyPrice + (index % 3) * 5,
        active: pkg.tier === 'basic' || packageIndex <= 2 || index % 2 === 0,
      })),
    };
  })).returning();

  for (const company of [city, lux, eco]) {
    const companyVehicles = fleet.filter((vehicle:any) => vehicle.companyId === company.id);
    await db.insert(kilometerPolicies).values({
      companyId:company.id, name:'Standard mileage',
      description:'Default daily distance allowance and excess-distance fee for the fleet.',
      dailyKilometerAllowance:250, excessKilometerRate:0.9, appliesTo:'all', active:true,
    });
    const limitedVehicles = companyVehicles.filter((vehicle:any) => vehicle.dailyKilometerAllowance === 200);
    if (limitedVehicles.length) {
      const [limitedPolicy] = await db.insert(kilometerPolicies).values({
        companyId:company.id, name:'Controlled mileage',
        description:'Lower daily allowance for selected high-value or operationally restricted vehicles.',
        dailyKilometerAllowance:200, excessKilometerRate:1.25, appliesTo:'selected', active:true,
      }).returning();
      await db.insert(kilometerPolicyVehicles).values(limitedVehicles.map((vehicle:any) => ({
        policyId:limitedPolicy.id, vehicleId:vehicle.id,
      })));
    }
  }

  const packageBlueprints = [
    { tier:'basic', name:'Basic Flex', description:'Clear third-party liability disclosure with the vehicle policy deductible.', dailyPrice:0, deductible:5000, coverage:['TPL'], appliesTo:'all' },
    { tier:'pro', name:'Pro Drive', description:'Collision damage waiver for everyday city and highway rentals.', dailyPrice:40, deductible:3000, coverage:['TPL','CDW'], appliesTo:'all' },
    { tier:'premium', name:'Premium Journey', description:'Broader damage, theft, accident, and roadside protection.', dailyPrice:65, deductible:1500, coverage:['TPL','CDW','TP','PAI','RSA'], appliesTo:'selected' },
    { tier:'full', name:'Full Peace of Mind', description:'The broadest waiver package with zero deductible and glass, tyre, and underbody cover.', dailyPrice:100, deductible:0, coverage:['TPL','LDW','SCDW','TP','PAI','RSA','GLASS_TYRES'], appliesTo:'selected' },
  ] as const;
  const seededPackages:any[] = [];
  for (const company of [city, lux, eco]) {
    const rows = await db.insert(insurancePackages).values(packageBlueprints.map((pkg, index) => ({
      companyId:company.id, ...pkg, dailyPrice:pkg.dailyPrice + (company.id - 1) * 5,
      name:company.id === city.id ? pkg.name : `${pkg.name} ${company.logo}`,
    }))).returning();
    seededPackages.push(...rows);
  }
  const companyFleet = (companyId:number) => fleet.filter((vehicle:any) => vehicle.companyId === companyId);
  const packageVehicleLinks:any[] = [];
  for (const pkg of seededPackages.filter(pkg => pkg.appliesTo === 'selected')) {
    const eligible = companyFleet(pkg.companyId);
    const selectedVehicles = pkg.tier === 'premium' ? eligible.slice(0, 3) : eligible.filter((_:any, index:number) => index % 2 === 0);
    packageVehicleLinks.push(...selectedVehicles.map((vehicle:any) => ({ packageId:pkg.id, vehicleId:vehicle.id })));
  }
  await db.insert(insurancePackageVehicles).values(packageVehicleLinks);

  const maintenanceCatalogRows = await db.insert(maintenanceItems).values(
    [city, lux, eco].flatMap(company => DEFAULT_MAINTENANCE_ITEMS.map(item => ({ ...item, companyId: company.id })))
  ).returning();
  const maintenanceItem = (companyId: number, key: string) => maintenanceCatalogRows.find((item: any) => item.companyId === companyId && item.key === key)!;

  const serviceRows = await db.insert(premiumServices).values([
    { companyId:city.id, key:'driver', name:'Professional driver', description:'Licensed private driver for local or long-distance travel.', dailyPrice:95, active:true },
    { companyId:city.id, key:'luggage', name:'Loading & offloading help', description:'A trained assistant to load and offload luggage safely.', dailyPrice:35, active:true },
    { companyId:city.id, key:'child-seat', name:'Child safety seat', description:'Clean, inspected child seat installed before pickup.', dailyPrice:15, active:true },
    { companyId:city.id, key:'wifi', name:'In-car Wi-Fi', description:'Unlimited high-speed mobile Wi-Fi for the whole trip.', dailyPrice:12, active:true },
    { companyId:lux.id, key:'driver', name:'Executive chauffeur', description:'Professional uniformed chauffeur service.', dailyPrice:140, active:true },
    { companyId:lux.id, key:'luggage', name:'Luggage concierge', description:'Premium loading and offloading assistance.', dailyPrice:55, active:true },
    { companyId:lux.id, key:'child-seat', name:'Premium child seat', description:'Premium safety seat installed and inspected.', dailyPrice:22, active:true },
    { companyId:lux.id, key:'wifi', name:'Executive Wi-Fi', description:'High-speed private hotspot with unlimited data.', dailyPrice:18, active:true },
    { companyId:eco.id, key:'driver', name:'EV-trained driver', description:'Professional driver trained for electric vehicles.', dailyPrice:100, active:true },
    { companyId:eco.id, key:'luggage', name:'Loading & offloading help', description:'Careful luggage assistance at pickup and return.', dailyPrice:40, active:true },
    { companyId:eco.id, key:'child-seat', name:'Child safety seat', description:'Clean child seat fitted before your trip.', dailyPrice:16, active:true },
    { companyId:eco.id, key:'wifi', name:'Connected car Wi-Fi', description:'Unlimited in-car Wi-Fi for every passenger.', dailyPrice:10, active:true },
  ]).returning();
  const service = (companyId:number, key:string) => serviceRows.find((item:any)=>item.companyId===companyId&&item.key===key)!;

  const promoRows = await db.insert(promotions).values([
    { companyId: city.id, name:'Summer Escape', code:'SUMMER20', type:'percentage', value:20, appliesTo:'selected', startsAt:at(-20), endsAt:at(28), enabled:true, minQuantity:2, redemptions:34 },
    { companyId: city.id, name:'Weekly Wander', code:'WEEKLY15', type:'percentage', value:15, appliesTo:'all', startsAt:at(-45), endsAt:at(60), enabled:true, minQuantity:1, redemptions:67 },
    { companyId: city.id, name:'Welcome Drive', code:'FIRST50', type:'fixed', value:50, appliesTo:'all', startsAt:at(-100), endsAt:at(-10), enabled:true, minQuantity:1, redemptions:93 },
    { companyId: lux.id, name:'Suite Upgrade', code:'LUXURY10', type:'percentage', value:10, appliesTo:'all', startsAt:at(-5), endsAt:at(45), enabled:true, minQuantity:2, redemptions:21 },
    { companyId: lux.id, name:'Executive Weekend', code:'EXEC75', type:'fixed', value:75, appliesTo:'selected', startsAt:at(8), endsAt:at(40), enabled:true, minQuantity:2, redemptions:0 },
    { companyId: eco.id, name:'Electric Summer', code:'ECO25', type:'percentage', value:25, appliesTo:'selected', startsAt:at(-12), endsAt:at(35), enabled:true, minQuantity:3, redemptions:48 },
    { companyId: eco.id, name:'Green Miles', code:'GREEN12', type:'percentage', value:12, appliesTo:'all', startsAt:at(-30), endsAt:at(70), enabled:false, minQuantity:1, redemptions:16 },
  ]).returning();
  await db.insert(promotionVehicles).values([
    { promotionId: promoRows[0].id, vehicleId: fleet[0].id }, { promotionId: promoRows[0].id, vehicleId: fleet[2].id }, { promotionId: promoRows[0].id, vehicleId: fleet[4].id },
    { promotionId: promoRows[4].id, vehicleId: fleet[7].id }, { promotionId: promoRows[4].id, vehicleId: fleet[9].id },
    { promotionId: promoRows[5].id, vehicleId: fleet[11].id }, { promotionId: promoRows[5].id, vehicleId: fleet[12].id }, { promotionId: promoRows[5].id, vehicleId: fleet[13].id },
  ]);

  const rentalRows = [
    { vehicleId:fleet[0].id, renterId:alex.id, status:'active', rateType:'day', quantity:3, startsAt:at(-1,9), endsAt:at(2,9), subtotal:417, discount:62.55, total:354.45, promoCode:'WEEKLY15', promoDetails:[{code:'WEEKLY15',type:'percentage',value:15,discount:62.55}], pickupLocation:fleet[0].location, createdAt:at(-8) },
    { vehicleId:fleet[1].id, renterId:sara.id, status:'pending', rateType:'day', quantity:5, startsAt:at(2,11), endsAt:at(7,11), subtotal:825, discount:165, total:660, promoCode:'SUMMER20', promoDetails:[{code:'SUMMER20',type:'percentage',value:20,discount:165}], pickupLocation:fleet[1].location, createdAt:at(-2) },
    { vehicleId:fleet[2].id, renterId:maya.id, status:'active', rateType:'hour', quantity:30, startsAt:at(-1,14), endsAt:at(0,20), subtotal:630, discount:126, total:504, promoCode:'SUMMER20', promoDetails:[{code:'SUMMER20',type:'percentage',value:20,discount:126}], pickupLocation:fleet[2].location, createdAt:at(-5) },
    { vehicleId:fleet[4].id, renterId:james.id, status:'pending', rateType:'week', quantity:1, startsAt:at(5), endsAt:at(12), subtotal:870, discount:130.5, total:739.5, promoCode:'WEEKLY15', promoDetails:[{code:'WEEKLY15',type:'percentage',value:15,discount:130.5}], pickupLocation:fleet[4].location, createdAt:at(-1) },
    { vehicleId:fleet[6].id, renterId:alex.id, status:'pending', rateType:'day', quantity:2, startsAt:at(9), endsAt:at(11), subtotal:438, discount:43.8, total:394.2, promoCode:'LUXURY10', promoDetails:[{code:'LUXURY10',type:'percentage',value:10,discount:43.8}], pickupLocation:fleet[6].location, createdAt:at(-2) },
    { vehicleId:fleet[11].id, renterId:sara.id, status:'active', rateType:'week', quantity:1, startsAt:at(-2), endsAt:at(5), subtotal:899, discount:224.75, total:674.25, promoCode:'ECO25', promoDetails:[{code:'ECO25',type:'percentage',value:25,discount:224.75}], pickupLocation:fleet[11].location, createdAt:at(-10) },
    { vehicleId:fleet[12].id, renterId:alex.id, status:'completed', rateType:'day', quantity:3, startsAt:at(-21), endsAt:at(-18), subtotal:387, discount:96.75, total:290.25, promoCode:'ECO25', promoDetails:[{code:'ECO25',type:'percentage',value:25,discount:96.75}], pickupLocation:fleet[12].location, createdAt:at(-29) },
    { vehicleId:fleet[3].id, renterId:alex.id, status:'completed', rateType:'week', quantity:1, startsAt:at(-42), endsAt:at(-35), subtotal:529, discount:79.35, total:449.65, promoCode:'WEEKLY15', promoDetails:[{code:'WEEKLY15',type:'percentage',value:15,discount:79.35}], pickupLocation:fleet[3].location, createdAt:at(-49) },
    { vehicleId:fleet[7].id, renterId:alex.id, status:'completed', rateType:'day', quantity:2, startsAt:at(-68), endsAt:at(-66), subtotal:518, discount:51.8, total:466.2, promoCode:'LUXURY10', promoDetails:[{code:'LUXURY10',type:'percentage',value:10,discount:51.8}], pickupLocation:fleet[7].location, createdAt:at(-74) },
    { vehicleId:fleet[13].id, renterId:maya.id, status:'completed', rateType:'month', quantity:1, startsAt:at(-96), endsAt:at(-66), subtotal:3020, discount:0, total:3020, pickupLocation:fleet[13].location, createdAt:at(-102) },
    { vehicleId:fleet[8].id, renterId:sara.id, status:'cancelled', rateType:'day', quantity:1, startsAt:at(-14), endsAt:at(-13), subtotal:235, discount:0, total:235, pickupLocation:fleet[8].location, createdAt:at(-20) },
    { vehicleId:fleet[14].id, renterId:james.id, status:'completed', rateType:'week', quantity:2, startsAt:at(-125), endsAt:at(-111), subtotal:2098, discount:251.76, total:1846.24, promoCode:'GREEN12', promoDetails:[{code:'GREEN12',type:'percentage',value:12,discount:251.76}], pickupLocation:fleet[14].location, createdAt:at(-130) },
  ];
  const seededRentals = await db.insert(rentals).values(rentalRows.map((row:any,index:number)=>{
    const vehicle = fleet.find((entry:any) => entry.id === row.vehicleId)!;
    const renter = seededUsers.find((entry:any) => entry.id === row.renterId)!;
    const durationDays = Math.max(1, Math.ceil((row.endsAt.getTime() - row.startsAt.getTime()) / 86_400_000));
    const availablePackages = seededPackages.filter(pkg => pkg.companyId === vehicle.companyId
      && (pkg.appliesTo === 'all' || packageVehicleLinks.some(link => link.packageId === pkg.id && link.vehicleId === vehicle.id)));
    const selected = availablePackages[index % availablePackages.length];
    const protectionSubtotal = selected.dailyPrice * durationDays;
    const pickupOption = vehicle.pickupLocations[index % vehicle.pickupLocations.length];
    const returnOption = vehicle.pickupLocations[(index + 1) % vehicle.pickupLocations.length];
    const hasPickup = row.status === 'active' || row.status === 'completed';
    const completed = row.status === 'completed';
    const fuelCharge = index === 7 ? 48 : 0;
    const pickupDistance = completed ? (index === 6 ? 840 : 340) : 120;
    const allowedKilometers = durationDays * vehicle.dailyKilometerAllowance;
    const excessKilometers = completed ? Math.max(0, pickupDistance - allowedKilometers) : 0;
    const excessDistanceCharge = Math.round(excessKilometers * vehicle.excessKilometerRate * 100) / 100;
    return {
      ...row,
      invoiceToken:`demo-invoice-${String(index+1).padStart(3,'0')}`,
      extrasSubtotal:0,
      bookingOdometer: hasPickup ? Math.max(0, vehicle.odometer - pickupDistance) : vehicle.odometer,
      renterOdometerAcknowledged:hasPickup,
      renterOdometerAcknowledgedAt:hasPickup ? row.startsAt : null,
      confirmedAt:['active','completed'].includes(row.status) ? row.startsAt : null,
      renterSignatureName:hasPickup ? renter.name : null,
      renterSignedAt:hasPickup ? row.startsAt : null,
      handoverByRole:hasPickup ? 'renter' : null,
      handoverByUserId:hasPickup ? renter.id : null,
      invoiceIssuedAt:hasPickup ? row.startsAt : null,
      paidAt:completed ? row.endsAt : null,
      protectionPackageId:selected.id,
      protectionTier:selected.tier,
      protectionName:selected.name,
      protectionDailyPrice:selected.dailyPrice,
      protectionDays:durationDays,
      protectionSubtotal,
      protectionDeductible:selected.deductible,
      protectionCoverage:selected.coverage,
      extraDiscount:0,
      fuelCharge,
      pickupOdometer:hasPickup ? Math.max(0, vehicle.odometer - pickupDistance) : null,
      returnOdometer:completed ? vehicle.odometer : null,
      pickupFuelLevel:hasPickup ? 100 : null,
      returnFuelLevel:completed ? vehicle.fuelLevel : null,
      dailyKilometerAllowance:vehicle.dailyKilometerAllowance,
      allowedKilometers,
      excessKilometerRate:vehicle.excessKilometerRate,
      pickupCity:pickupOption.city,
      pickupLocation:pickupOption.site,
      returnCity:returnOption.city,
      returnLocation:returnOption.site,
      excessDistanceCharge,
      total:row.total + protectionSubtotal + fuelCharge + excessDistanceCharge,
    };
  })).returning();

  const cityDriver=service(city.id,'driver'), cityWifi=service(city.id,'wifi'), cityChild=service(city.id,'child-seat'), cityLuggage=service(city.id,'luggage');
  const luxDriver=service(lux.id,'driver'), ecoWifi=service(eco.id,'wifi');
  await db.insert(rentalServices).values([
    { rentalId:seededRentals[0].id, serviceId:cityDriver.id, name:cityDriver.name, unitPrice:cityDriver.dailyPrice, days:2, discount:0, subtotal:190 },
    { rentalId:seededRentals[0].id, serviceId:cityWifi.id, name:cityWifi.name, unitPrice:cityWifi.dailyPrice, days:3, discount:0, subtotal:36 },
    { rentalId:seededRentals[1].id, serviceId:cityChild.id, name:cityChild.name, unitPrice:cityChild.dailyPrice, days:5, discount:0, subtotal:75 },
    { rentalId:seededRentals[1].id, serviceId:cityLuggage.id, name:cityLuggage.name, unitPrice:cityLuggage.dailyPrice, days:1, discount:5, subtotal:35 },
    { rentalId:seededRentals[4].id, serviceId:luxDriver.id, name:luxDriver.name, unitPrice:luxDriver.dailyPrice, days:2, discount:0, subtotal:280 },
    { rentalId:seededRentals[6].id, serviceId:ecoWifi.id, name:ecoWifi.name, unitPrice:ecoWifi.dailyPrice, days:3, discount:0, subtotal:30 },
  ]);
  await db.update(rentals).set({extrasSubtotal:226,extraDiscount:10,total:seededRentals[0].total+216}).where(eq(rentals.id,seededRentals[0].id));
  await db.update(rentals).set({extrasSubtotal:105,total:seededRentals[1].total+105}).where(eq(rentals.id,seededRentals[1].id));
  await db.update(rentals).set({extrasSubtotal:280,total:seededRentals[4].total+280}).where(eq(rentals.id,seededRentals[4].id));
  await db.update(rentals).set({extrasSubtotal:30,total:seededRentals[6].total+30}).where(eq(rentals.id,seededRentals[6].id));

  const cityProgram = loyaltyProgramRows.find((program:any) => program.companyId === city.id)!;
  const cityLevels = await db.select().from(loyaltyLevels).where(eq(loyaltyLevels.programId, cityProgram.id));
  const completedForRewards = (await db.select({
    id:rentals.id, renterId:rentals.renterId, total:rentals.total, endsAt:rentals.endsAt,
    status:rentals.status, companyId:vehicles.companyId,
  }).from(rentals).innerJoin(vehicles, eq(rentals.vehicleId, vehicles.id)))
    .filter((rental:any) => rental.companyId === city.id && rental.status === 'completed')
    .sort((a:any,b:any) => new Date(a.endsAt).getTime() - new Date(b.endsAt).getTime());
  const memberPoints = new Map<number,number>();
  for (const rental of completedForRewards) {
    const existingPoints = memberPoints.get(rental.renterId) || 0;
    const reached = cityLevels.filter((level:any) => level.pointsThreshold <= existingPoints).sort((a:any,b:any) => b.pointsThreshold - a.pointsThreshold);
    const level = reached[0] || cityLevels.find((entry:any) => entry.rank === 0)!;
    const points = Math.max(0, Math.floor(Number(rental.total)));
    await db.update(rentals).set({
      loyaltyLevelId:level.id, loyaltyLevelName:level.name,
      loyaltyDiscountPercentage:0, loyaltyDiscount:0,
      loyaltyPointsRate:1, loyaltyPointsEarned:points,
    }).where(eq(rentals.id, rental.id));
    await db.insert(loyaltyPointLedger).values({
      companyId:city.id, renterId:rental.renterId, rentalId:rental.id,
      points, eligibleSpend:rental.total, createdAt:rental.endsAt,
    });
    memberPoints.set(rental.renterId, existingPoints + points);
  }

  const companyUserById = new Map([[city.id, seededUsers[4]], [lux.id, seededUsers[5]], [eco.id, seededUsers[6]]]);
  const conditionSeed:any[] = fleet.map((vehicle:any, index:number) => ({
    companyId:vehicle.companyId,
    vehicleId:vehicle.id,
    recordedBy:companyUserById.get(vehicle.companyId)?.id,
    eventType:'manual',
    odometer:Math.max(0, vehicle.odometer - 1000 - index * 10),
    fuelLevel:50,
    notes:'Opening fleet condition reading',
    createdAt:at(-180 + index, 8),
  }));
  seededRentals.forEach((rental:any) => {
    const vehicle = fleet.find((entry:any) => entry.id === rental.vehicleId)!;
    const recordedBy = companyUserById.get(vehicle.companyId)?.id;
    if (rental.pickupOdometer != null) conditionSeed.push({
      companyId:vehicle.companyId, vehicleId:vehicle.id, rentalId:rental.id, recordedBy,
      eventType:'pickup', odometer:rental.pickupOdometer, fuelLevel:rental.pickupFuelLevel,
      notes:'Pickup handover reading signed by the renter', createdAt:rental.startsAt,
    });
    if (rental.returnOdometer != null) conditionSeed.push({
      companyId:vehicle.companyId, vehicleId:vehicle.id, rentalId:rental.id, recordedBy,
      eventType:'return', odometer:rental.returnOdometer, fuelLevel:rental.returnFuelLevel,
      notes:'Return inspection reading', createdAt:rental.endsAt,
    });
  });
  conditionSeed.push({
    companyId:fleet[5].companyId, vehicleId:fleet[5].id, recordedBy:companyUserById.get(fleet[5].companyId)?.id,
    eventType:'refuel', odometer:fleet[5].odometer, fuelLevel:fleet[5].fuelLevel,
    fuelAddedLiters:31.4, fuelCost:87.5, notes:'Fleet refuel after safety inspection · Station Central', createdAt:at(-3, 16),
  });
  [fleet[0],fleet[1],fleet[2],fleet[4],fleet[6],fleet[7]].forEach((vehicle:any,index:number) => {
    const activePickup = seededRentals.find((rental:any) => rental.vehicleId === vehicle.id && rental.status === 'active')?.pickupOdometer;
    const latestSafeOdometer = activePickup == null ? vehicle.odometer : activePickup;
    conditionSeed.push(
      { companyId:vehicle.companyId, vehicleId:vehicle.id, recordedBy:companyUserById.get(vehicle.companyId)?.id, eventType:'refuel', odometer:Math.max(0,latestSafeOdometer-520), fuelLevel:80, fuelAddedLiters:24+index, fuelCost:58+index*3, notes:`Baseline full-tank fueling · Station ${String.fromCharCode(65+index)}`, createdAt:at(-65-index,13) },
      { companyId:vehicle.companyId, vehicleId:vehicle.id, recordedBy:companyUserById.get(vehicle.companyId)?.id, eventType:'refuel', odometer:Math.max(0,latestSafeOdometer-260), fuelLevel:86, fuelAddedLiters:20+index*.8, fuelCost:49+index*3.5, notes:`Routine fleet fueling · Station ${String.fromCharCode(71+index)}`, createdAt:at(-30-index,14) },
      { companyId:vehicle.companyId, vehicleId:vehicle.id, recordedBy:companyUserById.get(vehicle.companyId)?.id, eventType:'refuel', odometer:Math.max(0,latestSafeOdometer-80), fuelLevel:92, fuelAddedLiters:16+index*.7, fuelCost:41+index*3.25, notes:`Pre-rental top-up · Station ${String.fromCharCode(77+index)}`, createdAt:at(-9-index,16) },
    );
  });
  await db.insert(vehicleConditionLogs).values(conditionSeed);

  const maintenanceSeed = [
    { companyId:city.id, vehicleId:fleet[0].id, item:maintenanceItem(city.id,'engine-oil'), status:'completed', priority:'routine', dueAt:at(-42,8), scheduledAt:at(-45,8), durationHours:1.5, completedAt:at(-45,10), completedOdometer:7900, dueOdometer:8000, cost:148, vendor:'Bay Auto Service', notes:'Oil and filter replaced. No leaks found.' },
    { companyId:city.id, vehicleId:fleet[1].id, item:maintenanceItem(city.id,'engine-oil'), status:'scheduled', priority:'soon', dueAt:at(3,9), scheduledAt:at(1,8), durationHours:1.5, dueOdometer:13000, cost:0, vendor:'CityDrive Workshop', notes:'Must be completed before reservation pickup.' },
    { companyId:city.id, vehicleId:fleet[2].id, item:maintenanceItem(city.id,'battery'), status:'scheduled', priority:'urgent', dueAt:at(0,18), scheduledAt:at(1,9), durationHours:1, dueOdometer:5200, cost:0, vendor:'CityDrive Workshop', notes:'Vehicle is currently rented; service immediately after protected return.' },
    { companyId:city.id, vehicleId:fleet[4].id, item:maintenanceItem(city.id,'brakes'), status:'scheduled', priority:'soon', dueAt:at(6,8), scheduledAt:at(4,6), durationHours:2.5, dueOdometer:7000, cost:0, vendor:'Marina Brake Center', notes:'Pre-reservation brake inspection and front pad replacement.' },
    { companyId:city.id, vehicleId:fleet[3].id, item:maintenanceItem(city.id,'safety-inspection'), status:'scheduled', priority:'urgent', dueAt:at(-2,8), scheduledAt:at(1,11), durationHours:1.5, dueOdometer:19000, cost:0, vendor:'SFO Fleet Workshop', notes:'Overdue roadworthiness inspection.' },
    { companyId:lux.id, vehicleId:fleet[6].id, item:maintenanceItem(lux.id,'tires'), status:'scheduled', priority:'routine', dueAt:at(18,9), scheduledAt:at(14,9), durationHours:1, dueOdometer:8000, cost:0, vendor:'Beverly Hills Tire', notes:'Rotation, pressure, and alignment check.' },
    { companyId:lux.id, vehicleId:fleet[7].id, item:maintenanceItem(lux.id,'cabin-filter'), status:'completed', priority:'routine', dueAt:at(-8,9), scheduledAt:at(-10,9), durationHours:1, completedAt:at(-10,10), completedOdometer:5000, dueOdometer:5000, cost:220, vendor:'Mercedes-Benz Service', notes:'Cabin filter replaced and A/C disinfected.' },
    { companyId:eco.id, vehicleId:fleet[11].id, item:maintenanceItem(eco.id,'tires'), status:'scheduled', priority:'soon', dueAt:at(5,8), scheduledAt:at(6,9), durationHours:1, dueOdometer:6500, cost:0, vendor:'EcoMotion Hub', notes:'Schedule follows active rental return.' },
    { companyId:eco.id, vehicleId:fleet[12].id, item:maintenanceItem(eco.id,'battery'), status:'scheduled', priority:'routine', dueAt:at(24,9), scheduledAt:at(20,9), durationHours:1, dueOdometer:20500, cost:0, vendor:'EcoMotion Hub', notes:'12V battery and high-voltage health inspection.' },
  ];
  await db.insert(maintenanceWorkOrders).values(maintenanceSeed.map((entry:any) => ({
    companyId:entry.companyId, vehicleId:entry.vehicleId, itemId:entry.item.id,
    title:entry.item.name, description:entry.item.description, status:entry.status, priority:entry.priority,
    dueAt:entry.dueAt, dueOdometer:entry.dueOdometer, scheduledAt:entry.scheduledAt,
    durationHours:entry.durationHours, completedAt:entry.completedAt, completedOdometer:entry.completedOdometer,
    cost:entry.cost, vendor:entry.vendor, notes:entry.notes,
    recurrenceDays:entry.item.intervalDays, recurrenceKm:entry.item.intervalKm,
  })));

  const [sampleTicket] = await db.insert(supportTickets).values({
    userId: alex.id,
    companyId: city.id,
    rentalId: seededRentals[0].id,
    subject: 'Pickup instructions for my current rental',
    category: 'booking',
    priority: 'normal',
    status: 'waiting',
    createdAt: at(-1, 8),
    updatedAt: at(-1, 9),
  }).returning();
  await db.insert(supportMessages).values([
    {
      ticketId: sampleTicket.id,
      senderType: 'customer',
      senderUserId: alex.id,
      body: 'Could you confirm where I should meet the CityDrive representative for pickup?',
      createdAt: at(-1, 8),
      readAt: at(-1, 8),
    },
    {
      ticketId: sampleTicket.id,
      senderType: 'company',
      senderUserId: olivia.id,
      body: 'Thanks for reaching out. Pickup is at the vehicle location shown on your rental bill. We are confirming the exact handover point with CityDrive and will update you here shortly.',
      automated: false,
      createdAt: at(-1, 9),
    },
  ]);
  await db.insert(notifications).values({
    userId: alex.id,
    type: 'support_reply',
    body: sampleTicket.subject,
    href: `/dashboard/support?conversation=${sampleTicket.id}`,
    entityType: 'support_ticket',
    entityId: sampleTicket.id,
    dedupeKey: `support-seed-reply-${sampleTicket.id}`,
    createdAt: at(-1, 9),
  });
}

async function run() {
  if (process.argv[1]?.endsWith('seed.ts')) {
    const { getDb, resetDatabase } = await import('./index');
    await resetDatabase();
    await getDb();
    console.log('FleetFlow demo data seeded.');
    process.exit(0);
  }
}
run();
