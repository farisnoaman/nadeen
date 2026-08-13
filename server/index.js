import express from 'express';
import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const dataDir = path.join(root, 'data');
fs.mkdirSync(dataDir, { recursive: true });
const db = new DatabaseSync(path.join(dataDir, 'motiv.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

const hashPassword = (value) => createHash('sha256').update(`motiv:${value}`).digest('hex');
const uid = () => randomBytes(18).toString('hex');
const iso = (offsetDays = 0, hour = 10) => {
  const date = new Date();
  date.setUTCHours(hour, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString();
};

function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('company','renter')),
      company_name TEXT,
      phone TEXT,
      avatar TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS vehicles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      make TEXT NOT NULL,
      model TEXT NOT NULL,
      year INTEGER NOT NULL,
      license_plate TEXT NOT NULL,
      category TEXT NOT NULL,
      color TEXT,
      seats INTEGER DEFAULT 5,
      transmission TEXT DEFAULT 'Automatic',
      fuel TEXT DEFAULT 'Petrol',
      mileage INTEGER DEFAULT 0,
      location TEXT,
      image TEXT,
      status TEXT NOT NULL DEFAULT 'available',
      rating REAL DEFAULT 5,
      hourly_rate REAL NOT NULL,
      daily_rate REAL NOT NULL,
      weekly_rate REAL NOT NULL,
      monthly_rate REAL NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS promotions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      code TEXT NOT NULL,
      discount_type TEXT NOT NULL DEFAULT 'percentage',
      value REAL NOT NULL,
      applies_to TEXT NOT NULL DEFAULT 'all',
      vehicle_ids TEXT DEFAULT '[]',
      min_duration INTEGER DEFAULT 1,
      start_date TEXT,
      end_date TEXT,
      status TEXT DEFAULT 'active',
      redemptions INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS rentals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vehicle_id INTEGER NOT NULL REFERENCES vehicles(id),
      user_id INTEGER NOT NULL REFERENCES users(id),
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      pricing_unit TEXT NOT NULL,
      quantity REAL NOT NULL,
      subtotal REAL NOT NULL,
      discount REAL DEFAULT 0,
      total REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'booked',
      pickup_location TEXT,
      promo_code TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

function seed() {
  const count = db.prepare('SELECT COUNT(*) AS count FROM users').get().count;
  if (count) return;

  const addUser = db.prepare(`INSERT INTO users (name,email,password_hash,role,company_name,phone,avatar) VALUES (?,?,?,?,?,?,?)`);
  const company = Number(addUser.run('Olivia Martin', 'olivia@northstar.rent', hashPassword('demo123'), 'company', 'Northstar Mobility', '+1 415 555 0198', 'OM').lastInsertRowid);
  const alex = Number(addUser.run('Alex Morgan', 'alex@example.com', hashPassword('demo123'), 'renter', null, '+1 628 555 0142', 'AM').lastInsertRowid);
  const maya = Number(addUser.run('Maya Chen', 'maya@example.com', hashPassword('demo123'), 'renter', null, '+1 415 555 0116', 'MC').lastInsertRowid);
  const jordan = Number(addUser.run('Jordan Lee', 'jordan@example.com', hashPassword('demo123'), 'renter', null, '+1 510 555 0184', 'JL').lastInsertRowid);
  const emma = Number(addUser.run('Emma Wilson', 'emma@example.com', hashPassword('demo123'), 'renter', null, '+1 707 555 0139', 'EW').lastInsertRowid);
  const noah = Number(addUser.run('Noah Davis', 'noah@example.com', hashPassword('demo123'), 'renter', null, '+1 408 555 0166', 'ND').lastInsertRowid);

  const addVehicle = db.prepare(`INSERT INTO vehicles
    (company_id,make,model,year,license_plate,category,color,seats,transmission,fuel,mileage,location,image,status,rating,hourly_rate,daily_rate,weekly_rate,monthly_rate)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const vehicles = [
    ['Mercedes-Benz','C-Class',2025,'MOT-4821','Luxury sedan','Graphite',5,'Automatic','Hybrid',8420,'SoMa, San Francisco','/cars/mercedes.jpg','rented',4.9,18,139,829,2890],
    ['Tesla','Model Y',2025,'EV-1708','Electric SUV','Pearl white',5,'Automatic','Electric',6150,'Mission District','/cars/tesla.jpg','available',4.8,20,149,899,3190],
    ['BMW','5 Series',2024,'BMW-5912','Executive','Midnight blue',5,'Automatic','Hybrid',12780,'Financial District','/cars/bmw.jpg','rented',4.9,22,165,990,3450],
    ['Range Rover','Velar',2024,'RVR-3306','Premium SUV','Forest green',5,'Automatic','Petrol',16420,'Pacific Heights','/cars/range-rover.jpg','maintenance',4.7,25,189,1149,3990],
    ['Audi','A6',2025,'AUD-7740','Executive','Silver',5,'Automatic','Hybrid',4980,'SoMa, San Francisco','/cars/audi.jpg','available',4.9,21,159,949,3290],
    ['Tesla','Model Y',2024,'EV-2264','Electric SUV','Midnight gray',5,'Automatic','Electric',19860,'Oakland Downtown','/cars/tesla.jpg','rented',4.8,19,145,869,3040],
    ['Mercedes-Benz','C-Class',2023,'MOT-8145','Luxury sedan','Obsidian',5,'Automatic','Petrol',31200,'SFO Airport','/cars/mercedes.jpg','available',4.6,16,125,749,2590],
    ['BMW','5 Series',2025,'BMW-1039','Executive','Alpine white',5,'Automatic','Hybrid',3540,'SFO Airport','/cars/bmw.jpg','available',5.0,23,175,1049,3690]
  ];
  const ids = vehicles.map(v => Number(addVehicle.run(company, ...v).lastInsertRowid));

  const addPromotion = db.prepare(`INSERT INTO promotions (company_id,name,code,discount_type,value,applies_to,vehicle_ids,min_duration,start_date,end_date,status,redemptions) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
  addPromotion.run(company,'Summer Escape','SUMMER20','percentage',20,'selected',JSON.stringify([ids[1],ids[3],ids[5]]),3,iso(-20),iso(24),'active',34);
  addPromotion.run(company,'Weekly Wander','WEEKLY15','percentage',15,'all','[]',7,iso(-45),iso(60),'active',67);
  addPromotion.run(company,'Electric Weekend','ELECTRIC25','percentage',25,'selected',JSON.stringify([ids[1],ids[5]]),2,iso(4),iso(38),'scheduled',0);
  addPromotion.run(company,'Welcome Drive','FIRST50','fixed',50,'all','[]',1,iso(-100),iso(-10),'expired',93);

  const addRental = db.prepare(`INSERT INTO rentals (vehicle_id,user_id,start_date,end_date,pricing_unit,quantity,subtotal,discount,total,status,pickup_location,promo_code,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const rentals = [
    [ids[0],alex,iso(-1,9),iso(2,9),'day',3,417,62.55,354.45,'active','SoMa, San Francisco','WEEKLY15',iso(-8)],
    [ids[2],maya,iso(0,11),iso(5,11),'day',5,825,165,660,'active','Financial District','SUMMER20',iso(-12)],
    [ids[5],jordan,iso(-2,14),iso(0,20),'hour',54,1026,205.2,820.8,'active','Oakland Downtown','SUMMER20',iso(-14)],
    [ids[1],emma,iso(2,10),iso(9,10),'week',1,899,134.85,764.15,'booked','Mission District','WEEKLY15',iso(-2)],
    [ids[4],noah,iso(4,8),iso(7,8),'day',3,477,0,477,'booked','SoMa, San Francisco',null,iso(-1)],
    [ids[7],alex,iso(9,12),iso(39,12),'month',1,3690,553.5,3136.5,'booked','SFO Airport','WEEKLY15',iso(-4)],
    [ids[1],alex,iso(-21),iso(-18),'day',3,447,89.4,357.6,'completed','Mission District','SUMMER20',iso(-30)],
    [ids[4],maya,iso(-35),iso(-28),'week',1,949,142.35,806.65,'completed','SoMa, San Francisco','WEEKLY15',iso(-42)],
    [ids[6],jordan,iso(-58),iso(-56),'day',2,250,0,250,'completed','SFO Airport',null,iso(-65)],
    [ids[0],emma,iso(-71),iso(-64),'week',1,829,124.35,704.65,'completed','SoMa, San Francisco','WEEKLY15',iso(-79)],
    [ids[3],alex,iso(-92),iso(-62),'month',1,3990,0,3990,'completed','Pacific Heights',null,iso(-100)],
    [ids[2],noah,iso(-15),iso(-14),'day',1,165,0,165,'cancelled','Financial District',null,iso(-20)]
  ];
  rentals.forEach(r => addRental.run(...r));
}

migrate();
seed();
const app = express();
app.use(express.json({ limit: '1mb' }));

function publicUser(user) {
  if (!user) return null;
  const { password_hash, ...safe } = user;
  return safe;
}
function createSession(userId) {
  const token = uid();
  db.prepare('INSERT INTO sessions (token,user_id) VALUES (?,?)').run(token,userId);
  return token;
}
function auth(req,res,next) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/,'');
  const user = token && db.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=?').get(token);
  if (!user) return res.status(401).json({ error: 'Please sign in to continue.' });
  req.user = user;
  req.token = token;
  next();
}
function companyOnly(req,res,next) {
  if (req.user.role !== 'company') return res.status(403).json({ error: 'Company access required.' });
  next();
}

app.post('/api/auth/login',(req,res) => {
  const { email = '', password = '' } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE lower(email)=lower(?)').get(email.trim());
  const given = Buffer.from(hashPassword(password));
  const expected = Buffer.from(user?.password_hash || ''.padEnd(64,'0'));
  if (!user || given.length !== expected.length || !timingSafeEqual(given,expected)) return res.status(401).json({ error: 'Email or password is incorrect.' });
  const token = createSession(user.id);
  res.json({ token, user: publicUser(user) });
});
app.post('/api/auth/demo',(req,res) => {
  const email = req.body.role === 'renter' ? 'alex@example.com' : 'olivia@northstar.rent';
  const user = db.prepare('SELECT * FROM users WHERE email=?').get(email);
  res.json({ token:createSession(user.id), user:publicUser(user) });
});
app.post('/api/auth/register',(req,res) => {
  const { name,email,password,role='renter',companyName=null } = req.body;
  if (!name || !email || !password || password.length < 6) return res.status(400).json({ error:'Complete all fields. Passwords need at least 6 characters.' });
  try {
    const result = db.prepare('INSERT INTO users (name,email,password_hash,role,company_name,avatar) VALUES (?,?,?,?,?,?)').run(name,email.toLowerCase(),hashPassword(password),role,companyName,(name.match(/\b\w/g)||[]).slice(0,2).join('').toUpperCase());
    const user = db.prepare('SELECT * FROM users WHERE id=?').get(result.lastInsertRowid);
    res.status(201).json({ token:createSession(user.id), user:publicUser(user) });
  } catch { res.status(409).json({ error:'An account with this email already exists.' }); }
});
app.get('/api/auth/me',auth,(req,res)=>res.json({user:publicUser(req.user)}));
app.post('/api/auth/logout',auth,(req,res)=>{ db.prepare('DELETE FROM sessions WHERE token=?').run(req.token); res.json({ok:true}); });

app.get('/api/dashboard',auth,(req,res) => {
  if (req.user.role === 'company') {
    const cid = req.user.id;
    const revenue = db.prepare(`SELECT COALESCE(SUM(r.total),0) value FROM rentals r JOIN vehicles v ON v.id=r.vehicle_id WHERE v.company_id=? AND r.status!='cancelled'`).get(cid).value;
    const monthRevenue = db.prepare(`SELECT COALESCE(SUM(r.total),0) value FROM rentals r JOIN vehicles v ON v.id=r.vehicle_id WHERE v.company_id=? AND r.status!='cancelled' AND r.created_at >= datetime('now','-30 days')`).get(cid).value;
    const vehicleStats = db.prepare(`SELECT status,COUNT(*) count FROM vehicles WHERE company_id=? GROUP BY status`).all(cid);
    const active = db.prepare(`SELECT COUNT(*) count FROM rentals r JOIN vehicles v ON v.id=r.vehicle_id WHERE v.company_id=? AND r.status='active'`).get(cid).count;
    const totalRentals = db.prepare(`SELECT COUNT(*) count FROM rentals r JOIN vehicles v ON v.id=r.vehicle_id WHERE v.company_id=?`).get(cid).count;
    const recent = db.prepare(`SELECT r.*,v.make,v.model,v.image,v.license_plate,u.name customer,u.avatar FROM rentals r JOIN vehicles v ON v.id=r.vehicle_id JOIN users u ON u.id=r.user_id WHERE v.company_id=? ORDER BY CASE r.status WHEN 'active' THEN 0 WHEN 'booked' THEN 1 ELSE 2 END,r.start_date DESC LIMIT 6`).all(cid);
    const months = ['Mar','Apr','May','Jun','Jul','Aug'];
    const chart = [18200,24600,22100,31800,35400,42860].map((revenue,i)=>({month:months[i],revenue,bookings:[54,68,62,85,98,128][i]}));
    return res.json({
      stats:{ revenue:Number(revenue), monthRevenue:Number(monthRevenue), totalRentals, active, vehicles:vehicleStats.reduce((a,x)=>a+x.count,0), available:vehicleStats.find(x=>x.status==='available')?.count||0, utilization:74.2, customers:db.prepare(`SELECT COUNT(DISTINCT r.user_id) count FROM rentals r JOIN vehicles v ON v.id=r.vehicle_id WHERE v.company_id=?`).get(cid).count },
      fleetStatus:vehicleStats,
      chart,recent
    });
  }
  const uid = req.user.id;
  const rentals = db.prepare(`SELECT r.*,v.make,v.model,v.image,v.category,v.location,v.rating FROM rentals r JOIN vehicles v ON v.id=r.vehicle_id WHERE r.user_id=? ORDER BY r.start_date DESC`).all(uid);
  const featured = db.prepare(`SELECT * FROM vehicles WHERE status='available' ORDER BY rating DESC LIMIT 5`).all();
  res.json({ stats:{total:rentals.length,active:rentals.filter(r=>r.status==='active').length,upcoming:rentals.filter(r=>r.status==='booked').length,spent:rentals.filter(r=>r.status!=='cancelled').reduce((a,r)=>a+r.total,0)}, rentals,featured });
});

const vehicleSelect = `SELECT v.*,(SELECT COUNT(*) FROM rentals r WHERE r.vehicle_id=v.id) rental_count,(SELECT COALESCE(SUM(total),0) FROM rentals r WHERE r.vehicle_id=v.id AND r.status!='cancelled') lifetime_revenue FROM vehicles v`;
app.get('/api/vehicles',auth,(req,res) => {
  const { status,search } = req.query;
  let where = req.user.role==='company' ? ' WHERE v.company_id=?' : " WHERE v.status='available'";
  const args = req.user.role==='company' ? [req.user.id] : [];
  if (status && status!=='all') { where += ' AND v.status=?'; args.push(status); }
  if (search) { where += ' AND (v.make LIKE ? OR v.model LIKE ? OR v.license_plate LIKE ?)'; args.push(`%${search}%`,`%${search}%`,`%${search}%`); }
  res.json({ vehicles:db.prepare(`${vehicleSelect}${where} ORDER BY v.created_at DESC,v.id DESC`).all(...args) });
});
app.get('/api/vehicles/:id',auth,(req,res) => {
  const vehicle = db.prepare(`${vehicleSelect} WHERE v.id=?`).get(req.params.id);
  if (!vehicle) return res.status(404).json({error:'Vehicle not found.'});
  const history = db.prepare(`SELECT r.*,u.name customer,u.avatar FROM rentals r JOIN users u ON u.id=r.user_id WHERE r.vehicle_id=? ORDER BY r.start_date DESC`).all(req.params.id);
  res.json({vehicle,history});
});
app.post('/api/vehicles',auth,companyOnly,(req,res) => {
  const v=req.body;
  const result=db.prepare(`INSERT INTO vehicles (company_id,make,model,year,license_plate,category,color,seats,transmission,fuel,mileage,location,image,status,rating,hourly_rate,daily_rate,weekly_rate,monthly_rate) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(req.user.id,v.make,v.model,v.year,v.license_plate,v.category,v.color||'',v.seats||5,v.transmission||'Automatic',v.fuel||'Petrol',v.mileage||0,v.location||'',v.image||'/cars/audi.jpg',v.status||'available',5,v.hourly_rate,v.daily_rate,v.weekly_rate,v.monthly_rate);
  res.status(201).json({vehicle:db.prepare(`${vehicleSelect} WHERE v.id=?`).get(result.lastInsertRowid)});
});
app.put('/api/vehicles/:id',auth,companyOnly,(req,res) => {
  const existing=db.prepare('SELECT * FROM vehicles WHERE id=? AND company_id=?').get(req.params.id,req.user.id);
  if(!existing) return res.status(404).json({error:'Vehicle not found.'});
  const v={...existing,...req.body};
  db.prepare(`UPDATE vehicles SET make=?,model=?,year=?,license_plate=?,category=?,color=?,seats=?,transmission=?,fuel=?,mileage=?,location=?,image=?,status=?,hourly_rate=?,daily_rate=?,weekly_rate=?,monthly_rate=? WHERE id=?`).run(v.make,v.model,v.year,v.license_plate,v.category,v.color,v.seats,v.transmission,v.fuel,v.mileage,v.location,v.image,v.status,v.hourly_rate,v.daily_rate,v.weekly_rate,v.monthly_rate,req.params.id);
  res.json({vehicle:db.prepare(`${vehicleSelect} WHERE v.id=?`).get(req.params.id)});
});
app.delete('/api/vehicles/:id',auth,companyOnly,(req,res) => {
  const used=db.prepare('SELECT COUNT(*) count FROM rentals WHERE vehicle_id=?').get(req.params.id).count;
  if(used) return res.status(409).json({error:'This vehicle has rental history. Mark it unavailable instead.'});
  db.prepare('DELETE FROM vehicles WHERE id=? AND company_id=?').run(req.params.id,req.user.id); res.json({ok:true});
});

const rentalSelect=`SELECT r.*,v.company_id,v.make,v.model,v.year,v.image,v.license_plate,v.category,v.location,u.name customer,u.email customer_email,u.avatar FROM rentals r JOIN vehicles v ON v.id=r.vehicle_id JOIN users u ON u.id=r.user_id`;
app.get('/api/rentals',auth,(req,res) => {
  const where=req.user.role==='company'?'v.company_id=?':'r.user_id=?';
  res.json({rentals:db.prepare(`${rentalSelect} WHERE ${where} ORDER BY CASE r.status WHEN 'active' THEN 0 WHEN 'booked' THEN 1 WHEN 'completed' THEN 2 ELSE 3 END,r.start_date DESC`).all(req.user.id)});
});
app.post('/api/rentals',auth,(req,res) => {
  const b=req.body;
  const vehicle=db.prepare('SELECT * FROM vehicles WHERE id=?').get(b.vehicle_id);
  if(!vehicle || vehicle.status!=='available') return res.status(409).json({error:'This vehicle is no longer available.'});
  const unit=b.pricing_unit||'day', quantity=Number(b.quantity)||1;
  const rates={hour:vehicle.hourly_rate,day:vehicle.daily_rate,week:vehicle.weekly_rate,month:vehicle.monthly_rate};
  const subtotal=rates[unit]*quantity;
  let discount=0,promo=null;
  if(b.promo_code){
    promo=db.prepare(`SELECT * FROM promotions WHERE upper(code)=upper(?) AND status='active' AND date(start_date)<=date('now') AND date(end_date)>=date('now')`).get(b.promo_code);
    const eligibleVehicle=promo&&(promo.applies_to==='all'||JSON.parse(promo.vehicle_ids).includes(vehicle.id));
    const durationDays={hour:quantity/24,day:quantity,week:quantity*7,month:quantity*30}[unit];
    if(promo&&eligibleVehicle&&durationDays>=promo.min_duration) discount=promo.discount_type==='percentage'?subtotal*promo.value/100:Math.min(subtotal,promo.value);
    else promo=null;
  }
  const start=b.start_date||iso(1), end=b.end_date||iso(unit==='hour'?1:quantity*(unit==='week'?7:unit==='month'?30:1));
  const result=db.prepare(`INSERT INTO rentals (vehicle_id,user_id,start_date,end_date,pricing_unit,quantity,subtotal,discount,total,status,pickup_location,promo_code) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(vehicle.id,req.user.id,start,end,unit,quantity,subtotal,discount,subtotal-discount,'booked',b.pickup_location||vehicle.location,promo?.code||null);
  if(promo) db.prepare('UPDATE promotions SET redemptions=redemptions+1 WHERE id=?').run(promo.id);
  res.status(201).json({rental:db.prepare(`${rentalSelect} WHERE r.id=?`).get(result.lastInsertRowid)});
});
app.put('/api/rentals/:id',auth,(req,res) => {
  const rental=db.prepare(`${rentalSelect} WHERE r.id=?`).get(req.params.id);
  const canManage = rental && (req.user.role==='renter' ? rental.user_id===req.user.id : rental.company_id===req.user.id);
  if(!canManage) return res.status(404).json({error:'Rental not found.'});
  const status=req.body.status||rental.status;
  db.prepare('UPDATE rentals SET status=? WHERE id=?').run(status,req.params.id);
  if(status==='active') db.prepare("UPDATE vehicles SET status='rented' WHERE id=?").run(rental.vehicle_id);
  if(status==='completed'||status==='cancelled') db.prepare("UPDATE vehicles SET status='available' WHERE id=?").run(rental.vehicle_id);
  res.json({rental:db.prepare(`${rentalSelect} WHERE r.id=?`).get(req.params.id)});
});
app.delete('/api/rentals/:id',auth,(req,res) => { const r=db.prepare('SELECT r.*,v.company_id FROM rentals r JOIN vehicles v ON v.id=r.vehicle_id WHERE r.id=?').get(req.params.id); const canManage=r&&(req.user.role==='renter'?r.user_id===req.user.id:r.company_id===req.user.id); if(!canManage) return res.status(404).json({error:'Rental not found.'}); if(r.status==='active') return res.status(409).json({error:'Active rentals must be completed before deletion.'}); db.prepare('DELETE FROM rentals WHERE id=?').run(req.params.id); res.json({ok:true}); });

app.get('/api/promotions',auth,companyOnly,(req,res)=>{
  const promos=db.prepare('SELECT * FROM promotions WHERE company_id=? ORDER BY created_at DESC').all(req.user.id).map(p=>({...p,vehicle_ids:JSON.parse(p.vehicle_ids||'[]')}));
  res.json({promotions:promos});
});
app.post('/api/promotions',auth,companyOnly,(req,res)=>{
  const p=req.body; const result=db.prepare(`INSERT INTO promotions (company_id,name,code,discount_type,value,applies_to,vehicle_ids,min_duration,start_date,end_date,status) VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(req.user.id,p.name,p.code.toUpperCase(),p.discount_type||'percentage',p.value,p.applies_to||'all',JSON.stringify(p.vehicle_ids||[]),p.min_duration||1,p.start_date,p.end_date,p.status||'active');
  const promo=db.prepare('SELECT * FROM promotions WHERE id=?').get(result.lastInsertRowid); res.status(201).json({promotion:{...promo,vehicle_ids:JSON.parse(promo.vehicle_ids)}});
});
app.put('/api/promotions/:id',auth,companyOnly,(req,res)=>{
  const old=db.prepare('SELECT * FROM promotions WHERE id=? AND company_id=?').get(req.params.id,req.user.id); if(!old)return res.status(404).json({error:'Promotion not found.'}); const p={...old,...req.body};
  db.prepare(`UPDATE promotions SET name=?,code=?,discount_type=?,value=?,applies_to=?,vehicle_ids=?,min_duration=?,start_date=?,end_date=?,status=? WHERE id=?`).run(p.name,p.code.toUpperCase(),p.discount_type,p.value,p.applies_to,JSON.stringify(p.vehicle_ids||JSON.parse(old.vehicle_ids||'[]')),p.min_duration,p.start_date,p.end_date,p.status,req.params.id);
  const promo=db.prepare('SELECT * FROM promotions WHERE id=?').get(req.params.id);res.json({promotion:{...promo,vehicle_ids:JSON.parse(promo.vehicle_ids)}});
});
app.delete('/api/promotions/:id',auth,companyOnly,(req,res)=>{db.prepare('DELETE FROM promotions WHERE id=? AND company_id=?').run(req.params.id,req.user.id);res.json({ok:true});});

app.get('/api/customers',auth,companyOnly,(req,res)=>{
  const customers=db.prepare(`SELECT u.id,u.name,u.email,u.phone,u.avatar,COUNT(r.id) rentals,COALESCE(SUM(CASE WHEN r.status!='cancelled' THEN r.total ELSE 0 END),0) spent,MAX(r.start_date) last_rental FROM users u JOIN rentals r ON r.user_id=u.id JOIN vehicles v ON v.id=r.vehicle_id WHERE v.company_id=? GROUP BY u.id ORDER BY spent DESC`).all(req.user.id);
  res.json({customers});
});

if(process.env.NODE_ENV==='production'){
  app.use(express.static(path.join(root,'dist')));
  app.use((req,res)=>res.sendFile(path.join(root,'dist','index.html')));
}else{
  const { createServer }=await import('vite');
  const vite=await createServer({root,server:{middlewareMode:true,allowedHosts:true},appType:'spa'});
  app.use(vite.middlewares);
}
const port=Number(process.env.PORT)||5173;
app.listen(port,'0.0.0.0',()=>console.log(`Motiv is ready at http://0.0.0.0:${port}`));
