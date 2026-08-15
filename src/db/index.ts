import fs from 'node:fs';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import * as schema from './schema';
import { seedDatabase } from './seed';

const ddl = `
CREATE TABLE IF NOT EXISTS companies (
  id SERIAL PRIMARY KEY, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE, logo TEXT,
  city TEXT NOT NULL DEFAULT 'San Francisco', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('renter','company')), company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
  phone TEXT, avatar TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS vehicles (
  id SERIAL PRIMARY KEY, company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  make TEXT NOT NULL, model TEXT NOT NULL, trim TEXT NOT NULL DEFAULT 'Standard', year INTEGER NOT NULL, category TEXT NOT NULL,
  body_type TEXT NOT NULL DEFAULT 'Sedan', gearbox TEXT NOT NULL DEFAULT 'Automatic',
  drivetrain TEXT NOT NULL DEFAULT 'FWD', steering_type TEXT NOT NULL DEFAULT 'Left-hand drive',
  fuel TEXT NOT NULL DEFAULT 'Petrol', seats INTEGER NOT NULL DEFAULT 5,
  color TEXT NOT NULL, license_plate TEXT NOT NULL, odometer INTEGER NOT NULL DEFAULT 0, location TEXT NOT NULL,
  features JSONB NOT NULL DEFAULT '[]'::jsonb, image TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available','maintenance','retired')),
  hourly_rate DOUBLE PRECISION NOT NULL, daily_rate DOUBLE PRECISION NOT NULL,
  weekly_rate DOUBLE PRECISION NOT NULL, monthly_rate DOUBLE PRECISION NOT NULL,
  rating DOUBLE PRECISION NOT NULL DEFAULT 4.8, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS trim TEXT NOT NULL DEFAULT 'Standard';
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS body_type TEXT NOT NULL DEFAULT 'Sedan';
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS drivetrain TEXT NOT NULL DEFAULT 'FWD';
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS steering_type TEXT NOT NULL DEFAULT 'Left-hand drive';
UPDATE vehicles SET
  trim = CASE model WHEN 'C-Class' THEN 'C 300' WHEN '5 Series' THEN '530e' WHEN 'A6' THEN 'Premium Plus' WHEN 'Camry' THEN 'XLE' WHEN 'XC60' THEN 'Ultra' WHEN 'Explorer' THEN 'Limited' WHEN 'Velar' THEN 'Dynamic SE' WHEN 'S-Class' THEN 'S 580e' WHEN 'X7' THEN 'xDrive40i' WHEN 'Panamera' THEN '4 E-Hybrid' WHEN 'Q8' THEN 'Premium Plus' WHEN 'Model Y' THEN 'Long Range' WHEN 'Model 3' THEN 'Long Range' WHEN '2' THEN 'Long Range Dual Motor' WHEN 'EV9' THEN 'GT-Line' WHEN 'Ioniq 5' THEN 'Limited' WHEN 'i5' THEN 'M60' ELSE trim END,
  body_type = CASE WHEN category ILIKE '%SUV%' OR model IN ('Explorer','X7','Q8','Model Y','EV9','Ioniq 5','XC60','Velar') THEN 'SUV' WHEN model IN ('Panamera','2') THEN 'Hatchback' ELSE 'Sedan' END,
  drivetrain = CASE WHEN model IN ('C-Class','Camry','S-Class') THEN 'RWD' WHEN model IN ('Model 3','Ioniq 5') THEN 'RWD' WHEN model IN ('5 Series','A6','XC60','Explorer','Velar','X7','Panamera','Q8','Model Y','2','EV9','i5') THEN 'AWD' ELSE drivetrain END
WHERE trim = 'Standard';
CREATE INDEX IF NOT EXISTS vehicles_company_idx ON vehicles(company_id);
CREATE INDEX IF NOT EXISTS vehicles_status_idx ON vehicles(status);
CREATE TABLE IF NOT EXISTS promotions (
  id SERIAL PRIMARY KEY, company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL, code TEXT NOT NULL, type TEXT NOT NULL CHECK(type IN ('percentage','fixed')),
  value DOUBLE PRECISION NOT NULL, applies_to TEXT NOT NULL DEFAULT 'all', starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL, enabled BOOLEAN NOT NULL DEFAULT TRUE, min_quantity INTEGER NOT NULL DEFAULT 1,
  redemptions INTEGER NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(company_id, code)
);
CREATE TABLE IF NOT EXISTS promotion_vehicles (
  promotion_id INTEGER NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  UNIQUE(promotion_id, vehicle_id)
);
CREATE TABLE IF NOT EXISTS premium_services (
  id SERIAL PRIMARY KEY, company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  key TEXT NOT NULL, name TEXT NOT NULL, description TEXT NOT NULL,
  daily_price DOUBLE PRECISION NOT NULL, active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(company_id, key)
);
CREATE TABLE IF NOT EXISTS rentals (
  id SERIAL PRIMARY KEY, vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE RESTRICT,
  renter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','active','completed','cancelled')),
  rate_type TEXT NOT NULL CHECK(rate_type IN ('hour','day','week','month')), quantity INTEGER NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL, ends_at TIMESTAMPTZ NOT NULL,
  subtotal DOUBLE PRECISION NOT NULL, discount DOUBLE PRECISION NOT NULL DEFAULT 0,
  extras_subtotal DOUBLE PRECISION NOT NULL DEFAULT 0, extra_discount DOUBLE PRECISION NOT NULL DEFAULT 0,
  total DOUBLE PRECISION NOT NULL, promo_code TEXT, invoice_token TEXT,
  pickup_location TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS extras_subtotal DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS extra_discount DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS invoice_token TEXT;
UPDATE rentals SET invoice_token = 'legacy-' || id::text WHERE invoice_token IS NULL;
ALTER TABLE rentals ALTER COLUMN invoice_token SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS rentals_invoice_token_idx ON rentals(invoice_token);
CREATE INDEX IF NOT EXISTS rentals_vehicle_idx ON rentals(vehicle_id);
CREATE INDEX IF NOT EXISTS rentals_renter_idx ON rentals(renter_id);
CREATE INDEX IF NOT EXISTS rentals_status_idx ON rentals(status);
CREATE TABLE IF NOT EXISTS rental_services (
  id SERIAL PRIMARY KEY, rental_id INTEGER NOT NULL REFERENCES rentals(id) ON DELETE CASCADE,
  service_id INTEGER REFERENCES premium_services(id) ON DELETE SET NULL,
  name TEXT NOT NULL, unit_price DOUBLE PRECISION NOT NULL, days INTEGER NOT NULL,
  discount DOUBLE PRECISION NOT NULL DEFAULT 0, subtotal DOUBLE PRECISION NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS rental_services_rental_idx ON rental_services(rental_id);
CREATE TABLE IF NOT EXISTS support_tickets (
  id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
  rental_id INTEGER REFERENCES rentals(id) ON DELETE SET NULL, subject TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN ('booking','billing','vehicle','account','technical','other')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('normal','urgent')),
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','waiting','resolved')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL;
UPDATE support_tickets AS ticket SET company_id = vehicle.company_id
FROM rentals AS rental JOIN vehicles AS vehicle ON vehicle.id = rental.vehicle_id
WHERE ticket.rental_id = rental.id AND ticket.company_id IS NULL;
CREATE INDEX IF NOT EXISTS support_tickets_user_idx ON support_tickets(user_id);
CREATE INDEX IF NOT EXISTS support_tickets_company_idx ON support_tickets(company_id);
CREATE INDEX IF NOT EXISTS support_tickets_status_idx ON support_tickets(status);
CREATE TABLE IF NOT EXISTS support_messages (
  id SERIAL PRIMARY KEY, ticket_id INTEGER NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL CHECK(sender_type IN ('customer','company','support')),
  sender_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  body TEXT NOT NULL, automated BOOLEAN NOT NULL DEFAULT FALSE,
  read_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE support_messages DROP CONSTRAINT IF EXISTS support_messages_sender_type_check;
ALTER TABLE support_messages ADD CONSTRAINT support_messages_sender_type_check CHECK(sender_type IN ('customer','company','support'));
CREATE INDEX IF NOT EXISTS support_messages_ticket_idx ON support_messages(ticket_id);
CREATE INDEX IF NOT EXISTS support_messages_unread_idx ON support_messages(read_at);
CREATE TABLE IF NOT EXISTS maintenance_items (
  id SERIAL PRIMARY KEY, company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  key TEXT NOT NULL, name TEXT NOT NULL, description TEXT NOT NULL,
  interval_days INTEGER, interval_km INTEGER,
  default_duration_hours DOUBLE PRECISION NOT NULL DEFAULT 1,
  active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, key)
);
CREATE TABLE IF NOT EXISTS maintenance_work_orders (
  id SERIAL PRIMARY KEY, company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  item_id INTEGER REFERENCES maintenance_items(id) ON DELETE SET NULL,
  title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled','in_progress','completed','cancelled')),
  priority TEXT NOT NULL DEFAULT 'routine' CHECK(priority IN ('routine','soon','urgent')),
  due_at TIMESTAMPTZ NOT NULL, due_odometer INTEGER,
  scheduled_at TIMESTAMPTZ NOT NULL, duration_hours DOUBLE PRECISION NOT NULL DEFAULT 1,
  vendor TEXT, cost DOUBLE PRECISION NOT NULL DEFAULT 0, notes TEXT,
  recurrence_days INTEGER, recurrence_km INTEGER,
  completed_at TIMESTAMPTZ, completed_odometer INTEGER,
  waybill_name TEXT, waybill_mime TEXT, waybill_data TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS maintenance_work_orders_company_idx ON maintenance_work_orders(company_id);
CREATE INDEX IF NOT EXISTS maintenance_work_orders_vehicle_idx ON maintenance_work_orders(vehicle_id);
CREATE INDEX IF NOT EXISTS maintenance_work_orders_status_idx ON maintenance_work_orders(status);
CREATE INDEX IF NOT EXISTS maintenance_work_orders_due_idx ON maintenance_work_orders(due_at);
CREATE TABLE IF NOT EXISTS user_settings (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  email_notifications BOOLEAN NOT NULL DEFAULT TRUE,
  in_app_notifications BOOLEAN NOT NULL DEFAULT TRUE,
  rental_notifications BOOLEAN NOT NULL DEFAULT TRUE,
  message_notifications BOOLEAN NOT NULL DEFAULT TRUE,
  billing_notifications BOOLEAN NOT NULL DEFAULT TRUE,
  marketing_notifications BOOLEAN NOT NULL DEFAULT FALSE,
  weekly_summary BOOLEAN NOT NULL DEFAULT TRUE,
  language TEXT NOT NULL DEFAULT 'en' CHECK(language IN ('en','ar')),
  theme TEXT NOT NULL DEFAULT 'light' CHECK(theme IN ('light','dark')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO user_settings(user_id)
SELECT id FROM users
ON CONFLICT (user_id) DO NOTHING;
CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK(type IN ('support_message','support_reply','support_status','rental_created','rental_status','billing_updated','maintenance_due','maintenance_overdue','maintenance_conflict','system')),
  body TEXT NOT NULL, href TEXT NOT NULL, entity_type TEXT, entity_id INTEGER,
  dedupe_key TEXT UNIQUE, read_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK(user_id IS NOT NULL OR company_id IS NOT NULL)
);
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK(type IN ('support_message','support_reply','support_status','rental_created','rental_status','billing_updated','maintenance_due','maintenance_overdue','maintenance_conflict','system'));
CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications(user_id);
CREATE INDEX IF NOT EXISTS notifications_company_idx ON notifications(company_id);
CREATE INDEX IF NOT EXISTS notifications_read_idx ON notifications(read_at);
INSERT INTO notifications(company_id, type, body, href, entity_type, entity_id, dedupe_key, created_at)
SELECT ticket.company_id, 'support_message', ticket.subject,
  '/dashboard/support?conversation=' || ticket.id::text, 'support_ticket', ticket.id,
  'support-ticket-' || ticket.id::text, ticket.updated_at
FROM support_tickets AS ticket
WHERE ticket.company_id IS NOT NULL
ON CONFLICT (dedupe_key) DO NOTHING;
`;

type Store = { promise?: Promise<any>; db?: any; raw?: any };
const globalStore = globalThis as typeof globalThis & { __fleetflowDb?: Store };
const store = globalStore.__fleetflowDb ||= {};

async function initialize() {
  let db: any;
  if (process.env.DATABASE_URL) {
    const [{ default: postgres }, { drizzle }] = await Promise.all([
      import('postgres'), import('drizzle-orm/postgres-js'),
    ]);
    const client = postgres(process.env.DATABASE_URL, { max: 5 });
    await client.unsafe(ddl);
    db = drizzle(client, { schema });
    store.raw = client;
    try {
      await client.unsafe(`CREATE EXTENSION IF NOT EXISTS btree_gist;
        ALTER TABLE rentals DROP CONSTRAINT IF EXISTS rentals_no_overlap;
        ALTER TABLE rentals ADD CONSTRAINT rentals_no_overlap EXCLUDE USING gist
        (vehicle_id WITH =, tstzrange(starts_at, ends_at + interval '1 hour', '[)') WITH &&)
        WHERE (status IN ('pending','active'));`);
    } catch (error) { console.warn('Overlap constraint could not be installed automatically:', error); }
  } else {
    const [{ PGlite }, { drizzle }] = await Promise.all([
      import('@electric-sql/pglite'), import('drizzle-orm/pglite'),
    ]);
    const directory = path.join(process.cwd(), 'data', 'fleetflow-pg');
    fs.mkdirSync(path.dirname(directory), { recursive: true });
    const client = new PGlite(directory);
    await client.exec(ddl);
    db = drizzle(client, { schema });
    store.raw = client;
    try {
      await client.exec(`CREATE EXTENSION IF NOT EXISTS btree_gist;
        ALTER TABLE rentals DROP CONSTRAINT IF EXISTS rentals_no_overlap;
        ALTER TABLE rentals ADD CONSTRAINT rentals_no_overlap EXCLUDE USING gist
        (vehicle_id WITH =, tstzrange(starts_at, ends_at + interval '1 hour', '[)') WITH &&)
        WHERE (status IN ('pending','active'));`);
    } catch { /* Application overlap guard remains active in embedded preview mode. */ }
  }
  const existing = await db.select({ id: schema.users.id }).from(schema.users).limit(1);
  if (!existing.length) await seedDatabase(db);
  store.db = db;
  return db;
}

export async function getDb() {
  if (store.db) return store.db;
  store.promise ||= initialize();
  return store.promise;
}

export async function resetDatabase() {
  const db = await getDb();
  await db.execute(sql.raw('TRUNCATE TABLE notifications, user_settings, support_messages, support_tickets, maintenance_work_orders, maintenance_items, promotion_vehicles, rental_services, rentals, premium_services, promotions, vehicles, users, companies RESTART IDENTITY CASCADE'));
  await seedDatabase(db);
}
