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
  make TEXT NOT NULL, model TEXT NOT NULL, year INTEGER NOT NULL, category TEXT NOT NULL,
  gearbox TEXT NOT NULL DEFAULT 'Automatic', fuel TEXT NOT NULL DEFAULT 'Petrol', seats INTEGER NOT NULL DEFAULT 5,
  color TEXT NOT NULL, license_plate TEXT NOT NULL, odometer INTEGER NOT NULL DEFAULT 0, location TEXT NOT NULL,
  features JSONB NOT NULL DEFAULT '[]'::jsonb, image TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available','maintenance','retired')),
  hourly_rate DOUBLE PRECISION NOT NULL, daily_rate DOUBLE PRECISION NOT NULL,
  weekly_rate DOUBLE PRECISION NOT NULL, monthly_rate DOUBLE PRECISION NOT NULL,
  rating DOUBLE PRECISION NOT NULL DEFAULT 4.8, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
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
CREATE TABLE IF NOT EXISTS rentals (
  id SERIAL PRIMARY KEY, vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE RESTRICT,
  renter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','active','completed','cancelled')),
  rate_type TEXT NOT NULL CHECK(rate_type IN ('hour','day','week','month')), quantity INTEGER NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL, ends_at TIMESTAMPTZ NOT NULL,
  subtotal DOUBLE PRECISION NOT NULL, discount DOUBLE PRECISION NOT NULL DEFAULT 0, total DOUBLE PRECISION NOT NULL,
  promo_code TEXT, pickup_location TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS rentals_vehicle_idx ON rentals(vehicle_id);
CREATE INDEX IF NOT EXISTS rentals_renter_idx ON rentals(renter_id);
CREATE INDEX IF NOT EXISTS rentals_status_idx ON rentals(status);
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
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rentals_no_overlap') THEN
            ALTER TABLE rentals ADD CONSTRAINT rentals_no_overlap EXCLUDE USING gist
            (vehicle_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&)
            WHERE (status IN ('pending','active'));
          END IF;
        END $$;`);
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
        ALTER TABLE rentals ADD CONSTRAINT rentals_no_overlap EXCLUDE USING gist
        (vehicle_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&)
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
  await db.execute(sql.raw('TRUNCATE TABLE promotion_vehicles, rentals, promotions, vehicles, users, companies RESTART IDENTITY CASCADE'));
  await seedDatabase(db);
}
