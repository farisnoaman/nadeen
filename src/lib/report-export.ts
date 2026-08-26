import fs from 'node:fs';
import path from 'node:path';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const labels:Record<string,string> = {
  'Company Performance & Rental Report':'تقرير أداء الشركة والإيجارات', 'Detailed Rental History':'سجل الإيجارات التفصيلي',
  'Vehicle Detailed Report':'تقرير السيارة التفصيلي', 'Customer Rental Report':'تقرير إيجارات العميل',
  'Executive Summary':'الملخص التنفيذي', 'Financial Summary':'الملخص المالي', 'Monthly Performance':'الأداء الشهري',
  'Vehicle Profitability':'ربحية السيارات', 'Customer Performance':'أداء العملاء', 'Rental History':'سجل الإيجارات',
  'Maintenance History':'سجل الصيانة', 'Fueling History':'سجل التزود بالوقود', 'Odometer / Usage History':'سجل العداد والاستخدام',
  'Total Rentals':'إجمالي الإيجارات', 'Rental Revenue':'إيرادات الإيجار', 'Total Cost':'إجمالي التكلفة', 'Net Profit':'صافي الربح',
  'Active Vehicles':'السيارات النشطة', Maintenance:'الصيانة', 'Fuel Cost':'تكلفة الوقود', 'Profit Margin':'هامش الربح',
  'Other Cost':'تكاليف أخرى', 'Total Costs':'إجمالي التكاليف', 'Report Period':'فترة التقرير', Generated:'تاريخ الإنشاء',
  Vehicle:'السيارة', Rentals:'الإيجارات', Revenue:'الإيرادات', Cost:'التكلفة', Profit:'الربح', Margin:'الهامش',
  Month:'الشهر', Contract:'العقد', Customer:'العميل', Start:'البداية', End:'النهاية', Days:'الأيام', Amount:'المبلغ', Status:'الحالة',
  Plate:'اللوحة', Odometer:'العداد', Date:'التاريخ', Type:'النوع', Description:'الوصف', Vendor:'المزود',
  Liters:'اللترات', 'Price/L':'السعر/لتر', Employee:'الموظف', Event:'الحدث', Fuel:'الوقود', Notes:'الملاحظات',
  'Fuel distance':'مسافة الوقود', 'Cost/KM':'التكلفة/كم', 'L/100KM':'لتر/100كم', Recommendation:'التوصية',
  insufficient_data:'بيانات غير كافية', good:'كفاءة جيدة', watch:'تحت المراقبة', withdrawal_review:'مراجعة السحب من الأسطول',
  Distance:'المسافة', 'Start Odo':'عداد البداية', 'End Odo':'عداد النهاية', 'Current Odometer':'العداد الحالي', VIN:'رقم الهيكل',
  'Rental Days':'أيام الإيجار', 'Total Distance':'إجمالي المسافة', 'Average KM / Rental':'متوسط كم لكل إيجار',
  'Maintenance Costs':'تكاليف الصيانة', 'FleetFlow Reporting System':'نظام تقارير فليت فلو',
  'Personal Rental Dashboard':'لوحة الإيجارات الشخصية', 'Personal Rental Overview':'نظرة عامة على إيجاراتي',
  'Monthly Rental Activity':'نشاط الإيجار الشهري', 'Recent Rental Activity':'أحدث نشاطات الإيجار',
  'Completed Trips':'الرحلات المكتملة', 'Total Spent':'إجمالي الإنفاق', Pending:'معلق', Active:'نشط', Completed:'مكتمل', Cancelled:'ملغي',
};
const reportTitle = (type:string, mode:string) => mode === 'renter' ? 'Personal Rental Dashboard' : type === 'vehicle' ? 'Vehicle Detailed Report' : type === 'rental_history' ? 'Detailed Rental History' : type === 'customer' ? 'Customer Rental Report' : 'Company Performance & Rental Report';
const money = (value:unknown, locale:'en'|'ar') => locale === 'ar' ? `${Number(value||0).toLocaleString('ar',{maximumFractionDigits:2})} $` : `$${Number(value||0).toLocaleString('en-US',{maximumFractionDigits:2})}`;
const number = (value:unknown, locale:'en'|'ar') => Number(value||0).toLocaleString(locale === 'ar' ? 'ar' : 'en-US',{maximumFractionDigits:2});
const date = (value:unknown, locale:'en'|'ar') => new Intl.DateTimeFormat(locale === 'ar' ? 'ar' : 'en-US',{day:'2-digit',month:'short',year:'numeric'}).format(new Date(value as any));
const percent = (value:unknown, locale:'en'|'ar') => `${number(value,locale)}%`;

export async function createReportPdf(report:any, locale:'en'|'ar'='en') {
  const pdf=await PDFDocument.create();
  const arabic=locale==='ar';
  let regular:any,bold:any,visual=(text:string)=>String(text);
  if(arabic){
    const fontkit=(await import('@pdf-lib/fontkit')).default;
    const bidiFactory=(await import('bidi-js')).default;
    const reshaperModule:any=await import('arabic-persian-reshaper');
    const ArabicShaper=reshaperModule.ArabicShaper||reshaperModule.default?.ArabicShaper;
    const bidi=bidiFactory();pdf.registerFontkit(fontkit);
    regular=await pdf.embedFont(fs.readFileSync(path.join(process.cwd(),'public/fonts/DejaVuSans.ttf')),{subset:true});
    bold=await pdf.embedFont(fs.readFileSync(path.join(process.cwd(),'public/fonts/DejaVuSans-Bold.ttf')),{subset:true});
    visual=(input:string)=>{const shaped=ArabicShaper.convertArabic(String(input));const chars=Array.from(shaped);const levels=bidi.getEmbeddingLevels(shaped,'rtl');for(const[start,end]of bidi.getReorderSegments(shaped,levels))chars.splice(start,end-start+1,...chars.slice(start,end+1).reverse());return chars.join('')};
  }else{regular=await pdf.embedFont(StandardFonts.Helvetica);bold=await pdf.embedFont(StandardFonts.HelveticaBold)}
  const W=841.89,H=595.28,marginX=30,green=rgb(.16,.34,.28),dark=rgb(.1,.14,.12),muted=rgb(.42,.47,.44),line=rgb(.86,.89,.87),soft=rgb(.94,.97,.95),white=rgb(1,1,1);
  const tx=(value:string)=>arabic?(labels[value]||value):value;
  let page:any,y=0;
  const pages:any[]=[];
  const fit=(input:unknown,width:number,size:number,font:any=regular)=>{let value=String(input??'-').replace(/[\n\r]+/g,' ');if(font.widthOfTextAtSize(arabic?visual(value):value,size)<=width)return value;while(value.length>2&&font.widthOfTextAtSize(arabic?visual(`${value}...`):`${value}...`,size)>width)value=value.slice(0,-1);return `${value}...`};
  const draw=(input:unknown,x:number,atY:number,size=8,font:any=regular,color:any=dark,maxWidth?:number)=>{const source=maxWidth?fit(input,maxWidth,size,font):String(input??'-');const rendered=arabic?visual(source):source;const drawX=arabic?W-x-font.widthOfTextAtSize(rendered,size):x;page.drawText(rendered,{x:drawX,y:atY,size,font,color});};
  const header=()=>{
    page.drawRectangle({x:0,y:H-78,width:W,height:78,color:green});
    draw(arabic?'فليت فلو':'FLEETFLOW',marginX,H-35,18,bold,white);
    draw(tx('FleetFlow Reporting System'),marginX,H-55,8,regular,rgb(.82,.9,.86));
    draw(tx(reportTitle(report.reportType,report.mode)),320,H-32,15,bold,white,360);
    draw(`${report.owner.name}  |  ${tx('Report Period')}: ${date(report.period.start,locale)} - ${date(report.period.end,locale)}`,320,H-53,7.5,regular,rgb(.84,.92,.88),480);
    draw(report.reportNumber,720,H-31,8,bold,white,90);
    y=H-101;
  };
  const addPage=()=>{page=pdf.addPage([W,H]);pages.push(page);header()};
  const ensure=(height:number)=>{if(y-height<43)addPage()};
  const section=(title:string)=>{ensure(30);draw(tx(title).toUpperCase(),marginX,y,9,bold,green);page.drawLine({start:{x:marginX,y:y-7},end:{x:W-marginX,y:y-7},thickness:.8,color:line});y-=25};
  const kpis=(items:Array<[string,string,string?]>)=>{
    const cols=4,gap=9,width=(W-marginX*2-gap*3)/cols;
    items.forEach((item,index)=>{if(index>0&&index%cols===0)y-=68;const col=index%cols,x=marginX+col*(width+gap);page.drawRectangle({x,y:y-53,width,height:53,color:soft,borderColor:line,borderWidth:.5});draw(tx(item[0]),x+10,y-17,7.5,bold,muted,width-20);draw(item[1],x+10,y-40,14,bold,green,width-20);if(item[2])draw(item[2],x+width-49,y-17,7,regular,muted,42)});y-=68;
  };
  const table=(title:string,headers:string[],rows:any[][],widths:number[])=>{
    section(title);const total=widths.reduce((a,b)=>a+b,0),available=W-marginX*2,scale=available/total,actual=widths.map(width=>width*scale);
    const tableHeader=()=>{ensure(26);page.drawRectangle({x:marginX,y:y-21,width:available,height:23,color:green});let x=marginX;headers.forEach((heading,index)=>{draw(tx(heading),x+5,y-14,7.2,bold,white,actual[index]-10);x+=actual[index]});y-=25};
    tableHeader();
    if(!rows.length){draw('-',marginX+5,y-12,7,regular,muted);y-=22;return}
    rows.forEach((row,rowIndex)=>{if(y-24<43){addPage();draw(tx(title),marginX,y,9,bold,green);y-=20;tableHeader()}if(rowIndex%2===1)page.drawRectangle({x:marginX,y:y-20,width:available,height:22,color:soft});let x=marginX;row.forEach((cell,index)=>{draw(cell,x+5,y-14,7.1,index===0?bold:regular,dark,actual[index]-10);x+=actual[index]});page.drawLine({start:{x:marginX,y:y-21},end:{x:W-marginX,y:y-21},thickness:.35,color:line});y-=22});y-=9;
  };
  const summary=report.summary;
  if(report.mode==='renter'){
    addPage();section('Personal Rental Overview');
    kpis([
      ['Total Rentals',number(summary.totalRentals,locale)],
      ['Completed Trips',number(summary.completedRentals,locale)],
      ['Total Spent',money(summary.totalSpent,locale)],
      ['Total Distance',`${number(summary.totalDistance,locale)} km`],
    ]);
    table('Monthly Rental Activity',['Month','Rentals','Total Spent'],report.monthly.slice(-6).map((row:any)=>[date(row.monthStart,locale),number(row.rentals,locale),money(row.spent,locale)]),[220,130,180]);
    table('Recent Rental Activity',['Contract','Vehicle','Status','Start','End','Days','Amount'],report.rentals.slice(-5).reverse().map((row:any)=>[row.contract,`${row.make} ${row.model} / ${row.licensePlate}`,tx(`${String(row.status).charAt(0).toUpperCase()}${String(row.status).slice(1)}`),date(row.startsAt,locale),date(row.endsAt,locale),row.days,money(row.total,locale)]),[80,190,75,90,90,45,85]);
    page.drawLine({start:{x:marginX,y:31},end:{x:W-marginX,y:31},thickness:.5,color:line});
    draw(tx('FleetFlow Reporting System'),marginX,18,7.5,regular,muted);
    draw(arabic?'صفحة 1 من 1':'Page 1 of 1',W-115,18,7.5,bold,muted,85);
    return pdf.save();
  }
  addPage();section('Executive Summary');
  kpis([
    ['Total Rentals',number(summary.totalRentals,locale),`${summary.changes.rentals>=0?'+':''}${percent(summary.changes.rentals,locale)}`],
    ['Rental Revenue',money(summary.rentalRevenue,locale),`${summary.changes.revenue>=0?'+':''}${percent(summary.changes.revenue,locale)}`],
    ['Total Cost',money(summary.totalCost,locale),`${summary.changes.cost>=0?'+':''}${percent(summary.changes.cost,locale)}`],
    ['Net Profit',money(summary.netProfit,locale),`${summary.changes.profit>=0?'+':''}${percent(summary.changes.profit,locale)}`],
    ['Active Vehicles',number(summary.activeVehicles,locale)],['Maintenance',money(summary.maintenanceCost,locale)],['Fuel Cost',money(summary.fuelCost,locale)],['Profit Margin',percent(summary.profitMargin,locale)],
  ]);
  section('Financial Summary');
  const financial=[['Rental Revenue',summary.rentalRevenue],['Maintenance Costs',summary.maintenanceCost],['Fuel Cost',summary.fuelCost],['Other Cost',summary.otherCost],['Total Costs',summary.totalCost],['Net Profit',summary.netProfit]];
  financial.forEach(([label,value],index)=>{draw(tx(String(label)),marginX,y,8,index>=4?bold:regular,index===5?green:dark);draw(money(value,locale),260,y,9,index>=4?bold:regular,index===5?green:dark);if(index===3||index===4)page.drawLine({start:{x:marginX,y:y-6},end:{x:350,y:y-6},thickness:.5,color:line});y-=17});
  y-=3;
  table('Monthly Performance',['Month','Rentals','Revenue','Cost','Profit','Margin'],report.monthly.map((row:any)=>[date(row.monthStart,locale),number(row.rentals,locale),money(row.revenue,locale),money(row.cost,locale),money(row.profit,locale),percent(row.margin,locale)]),[140,80,120,120,120,80]);

  if(report.reportType==='company'){
    table('Vehicle Profitability',['Vehicle','Plate','Rentals','Revenue','Maintenance','Fuel Cost','Cost/KM','L/100KM','Recommendation','Profit'],report.vehicles.map((row:any)=>[`${row.make} ${row.model}`,row.licensePlate,row.totalRentals,money(row.rentalRevenue,locale),money(row.maintenanceCost,locale),money(row.fuelCost,locale),money(row.fuelEfficiency?.costPerKm,locale),number(row.fuelEfficiency?.litersPer100Km,locale),tx(row.fuelEfficiency?.status||'insufficient_data'),money(row.netProfit,locale)]),[135,65,45,80,80,72,62,60,105,80]);
    table('Customer Performance',['Customer','Rentals','Rental Days','Distance','Revenue'],report.customers.map((row:any)=>[row.name,row.rentals,row.rentalDays,`${number(row.distance,locale)} km`,money(row.revenue,locale)]),[240,90,100,120,130]);
  }
  if(report.reportType==='vehicle'&&report.vehicleDetail){
    const vehicle=report.vehicleDetail;section('Vehicle Detailed Report');draw(`${vehicle.make} ${vehicle.model} - ${vehicle.licensePlate}`,marginX,y,15,bold,green);draw(`${tx('VIN')}: ${vehicle.vin||'-'}  |  ${tx('Current Odometer')}: ${number(vehicle.odometer,locale)} km`,marginX,y-20,8,regular,muted);y-=43;
    kpis([['Total Rentals',number(vehicle.stats.totalRentals,locale)],['Rental Days',number(vehicle.stats.rentalDays,locale)],['Revenue',money(vehicle.stats.rentalRevenue,locale)],['Net Profit',money(vehicle.stats.netProfit,locale)],['Maintenance',money(vehicle.stats.maintenanceCost,locale)],['Fuel Cost',money(vehicle.stats.fuelCost,locale)],['Total Distance',`${number(vehicle.stats.totalDistance,locale)} km`],['Profit Margin',percent(vehicle.stats.profitMargin,locale)],['Cost/KM',money(vehicle.fuelEfficiency?.costPerKm,locale)],['L/100KM',number(vehicle.fuelEfficiency?.litersPer100Km,locale)],['Recommendation',tx(vehicle.fuelEfficiency?.status||'insufficient_data')]]);
  }
  if(report.reportType==='customer'){
    const customer=report.customers[0];section('Customer Performance');if(customer){draw(customer.name,marginX,y,15,bold,green);draw(customer.email,marginX,y-20,8,regular,muted);y-=43;kpis([['Total Rentals',number(customer.rentals,locale)],['Rental Days',number(customer.rentalDays,locale)],['Total Distance',`${number(customer.distance,locale)} km`],['Rental Revenue',money(customer.revenue,locale)]])}
  }

  table('Rental History',['Contract','Vehicle','Customer','Start','End','Days','Start Odo','End Odo','Distance','Amount'],report.rentals.map((row:any)=>[row.contract,`${row.make} ${row.model} / ${row.licensePlate}`,row.customer,date(row.startsAt,locale),date(row.endsAt,locale),row.days,row.pickupOdometer??'-',row.returnOdometer??'-',`${number(row.distance,locale)} km`,money(row.total,locale)]),[75,145,120,83,83,42,68,68,67,80]);
  if(report.mode==='company'&&(report.reportType==='company'||report.reportType==='vehicle')){
    table('Maintenance History',['Vehicle','Date','Type','Description','Odometer','Vendor','Status','Cost'],report.maintenance.map((row:any)=>[`${row.make} ${row.model} / ${row.licensePlate}`,date(row.serviceDate,locale),row.priority,row.title,row.completedOdometer??row.dueOdometer??'-',row.vendor||'-',row.status,money(row.cost,locale)]),[150,85,65,180,75,110,70,80]);
    table('Fueling History',['Vehicle','Date','Odometer','Liters','Cost','Fuel distance','Cost/KM','L/100KM','Employee'],report.fueling.map((row:any)=>[`${row.make} ${row.model} / ${row.licensePlate}`,date(row.createdAt,locale),row.odometer,number(row.liters,locale),money(row.cost,locale),`${number(row.distanceSincePreviousFuel,locale)} km`,money(row.costPerKm,locale),number(row.litersPer100Km,locale),row.employee||'-']),[135,76,62,52,62,75,62,62,100]);
    if(report.reportType==='vehicle')table('Odometer / Usage History',['Date','Event','Odometer','Fuel','Contract','Notes'],report.odometer.map((row:any)=>[date(row.createdAt,locale),row.eventType,`${number(row.odometer,locale)} km`,`${row.fuelLevel}%`,row.rentalId?`R-${String(row.rentalId).padStart(6,'0')}`:'-',row.notes||'-']),[100,80,100,70,100,300]);
  }
  pages.forEach((item,index)=>{page=item;page.drawLine({start:{x:marginX,y:31},end:{x:W-marginX,y:31},thickness:.5,color:line});draw(tx('FleetFlow Reporting System'),marginX,18,7.5,regular,muted);draw(`${arabic?'صفحة':'Page'} ${index+1} ${arabic?'من':'of'} ${pages.length}`,W-115,18,7.5,bold,muted,85)});
  return pdf.save();
}

const xmlEscape=(value:unknown)=>String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
const excelCell=(value:unknown,header=false)=>{const numeric=typeof value==='number'&&Number.isFinite(value);return `<Cell${header?' ss:StyleID="Header"':''}><Data ss:Type="${numeric?'Number':'String'}">${xmlEscape(value)}</Data></Cell>`};
const worksheet=(name:string,headers:string[],rows:any[][])=>`<Worksheet ss:Name="${xmlEscape(name.slice(0,31))}"><Table><Row>${headers.map(value=>excelCell(value,true)).join('')}</Row>${rows.map(row=>`<Row>${row.map(value=>excelCell(value)).join('')}</Row>`).join('')}</Table><WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><FreezePanes/><FrozenNoSplit/><SplitHorizontal>1</SplitHorizontal><TopRowBottomPane>1</TopRowBottomPane></WorksheetOptions></Worksheet>`;

export function createReportExcel(report:any) {
  const summary=Object.entries(report.summary).filter(([,value])=>typeof value!=='object').map(([key,value])=>[key,value]);
  const sheets=[
    worksheet('Summary',['Metric','Value'],[['Report number',report.reportNumber],['Owner',report.owner.name],['Period start',report.period.start.slice(0,10)],['Period end',report.period.end.slice(0,10)],...summary]),
    worksheet('Rentals',['Contract','Vehicle','Plate','Customer','Email','Start','End','Days','Pickup city','Pickup site','Return city','Return site','Booking odometer','Renter acknowledged','Start odometer','End odometer','Distance km','Daily allowance','Total allowance','Excess rate','Subtotal','Promotion code','Promotion discount','Loyalty level','Loyalty discount %','Loyalty discount','Points rate','Points earned','Services','Protection','Fuel charge','Excess distance','Company discount','Total discounts','Total','Status'],report.rentals.map((row:any)=>[row.contract,`${row.make} ${row.model}`,row.licensePlate,row.customer,row.customerEmail,new Date(row.startsAt).toISOString(),new Date(row.endsAt).toISOString(),row.days,row.pickupCity,row.pickupLocation,row.returnCity,row.returnLocation,row.bookingOdometer,row.renterOdometerAcknowledged?'Yes':'No',row.pickupOdometer??'',row.returnOdometer??'',row.distance,row.dailyKilometerAllowance,row.allowedKilometers,row.excessKilometerRate,row.subtotal,row.promoCode||'',row.discount,row.loyaltyLevelName||'',row.loyaltyDiscountPercentage,row.loyaltyDiscount,row.loyaltyPointsRate,row.loyaltyPointsEarned,row.extrasSubtotal,row.protectionSubtotal,row.fuelCharge,row.excessDistanceCharge,row.extraDiscount,Number(row.discount||0)+Number(row.loyaltyDiscount||0)+Number(row.extraDiscount||0),row.total,row.status])),
    worksheet('Vehicle Profitability',['Vehicle','Plate','VIN','Rentals','Rental days','Distance km','Revenue','Maintenance','Fuel','Fuel distance km','Fuel cost/km','L/100 km','Efficiency recommendation','Other cost','Total cost','Profit','Margin %'],report.vehicles.map((row:any)=>[`${row.make} ${row.model}`,row.licensePlate,row.vin,row.totalRentals,row.rentalDays,row.totalDistance,row.rentalRevenue,row.maintenanceCost,row.fuelCost,row.fuelEfficiency?.totalDistance||0,row.fuelEfficiency?.costPerKm||0,row.fuelEfficiency?.litersPer100Km||0,row.fuelEfficiency?.status||'insufficient_data',row.otherCost,row.totalCost,row.netProfit,row.profitMargin])),
    worksheet('Customers',['Customer','Email','Rentals','Rental days','Distance km','Revenue'],report.customers.map((row:any)=>[row.name,row.email,row.rentals,row.rentalDays,row.distance,row.revenue])),
  ];
  if(report.mode==='company'){
    sheets.push(worksheet('Maintenance',['Vehicle','Plate','Date','Type','Description','Odometer','Vendor','Status','Cost','Notes'],report.maintenance.map((row:any)=>[`${row.make} ${row.model}`,row.licensePlate,new Date(row.serviceDate).toISOString(),row.priority,row.title,row.completedOdometer??row.dueOdometer??'',row.vendor||'',row.status,row.cost,row.notes||''])));
    sheets.push(worksheet('Fueling',['Vehicle','Plate','Date','Odometer','Liters','Price per liter','Total','Distance since previous fuel','Fuel cost/km','L/100 km','Employee','Notes'],report.fueling.map((row:any)=>[`${row.make} ${row.model}`,row.licensePlate,new Date(row.createdAt).toISOString(),row.odometer,row.liters,row.pricePerLiter,row.cost,row.distanceSincePreviousFuel,row.costPerKm,row.litersPer100Km,row.employee||'',row.notes||''])));
    sheets.push(worksheet('Odometer History',['Vehicle','Plate','Date','Event','Odometer','Fuel %','Contract','Employee','Notes'],report.odometer.map((row:any)=>[`${row.make} ${row.model}`,row.licensePlate,new Date(row.createdAt).toISOString(),row.eventType,row.odometer,row.fuelLevel,row.rentalId?`R-${String(row.rentalId).padStart(6,'0')}`:'',row.employee||'',row.notes||''])));
  }
  const xml=`<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Styles><Style ss:ID="Default" ss:Name="Normal"><Alignment ss:Vertical="Center"/><Font ss:FontName="Arial" ss:Size="10"/></Style><Style ss:ID="Header"><Font ss:FontName="Arial" ss:Size="10" ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#2E5C4C" ss:Pattern="Solid"/></Style></Styles>${sheets.join('')}</Workbook>`;
  return Buffer.from(`\uFEFF${xml}`,'utf8');
}
