import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { eq, sql } from 'drizzle-orm';
import * as schema from './schema';
import { seedDatabase } from './seed';

const ddl = `
CREATE TABLE IF NOT EXISTS subscription_plans (
  id SERIAL PRIMARY KEY, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '', monthly_price_usd DOUBLE PRECISION NOT NULL,
  max_vehicles INTEGER NOT NULL, max_rental_requests INTEGER NOT NULL, storage_gb INTEGER NOT NULL,
  features JSONB NOT NULL DEFAULT '[]'::jsonb, active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO subscription_plans(code,name,description,monthly_price_usd,max_vehicles,max_rental_requests,storage_gb,features)
VALUES
  ('STARTER','Starter','For independent and small rental offices',29,10,120,5,'["Core fleet and rental management","Invoices and renter support","Basic reporting"]'::jsonb),
  ('GROWTH','Growth','For expanding multi-team rental companies',89,50,1000,25,'["Everything in Starter","Advanced reports and exports","Promotions, loyalty and maintenance"]'::jsonb),
  ('SCALE','Scale','For large fleets and multi-branch operations',249,250,10000,100,'["Everything in Growth","High-volume operations","Priority platform support"]'::jsonb)
ON CONFLICT (code) DO NOTHING;
CREATE TABLE IF NOT EXISTS companies (
  id SERIAL PRIMARY KEY, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE, logo TEXT,
  city TEXT NOT NULL DEFAULT 'San Francisco', verification_status TEXT NOT NULL DEFAULT 'unsubmitted',
  verified_at TIMESTAMPTZ, subscription_plan_id INTEGER REFERENCES subscription_plans(id) ON DELETE SET NULL,
  subscription_status TEXT NOT NULL DEFAULT 'inactive', subscription_started_at TIMESTAMPTZ,
  operational_status TEXT NOT NULL DEFAULT 'paused', max_vehicles_override INTEGER,
  max_rental_requests_override INTEGER, storage_gb_override INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE companies ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'verified';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS subscription_plan_id INTEGER REFERENCES subscription_plans(id) ON DELETE SET NULL;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS subscription_status TEXT NOT NULL DEFAULT 'inactive';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS subscription_started_at TIMESTAMPTZ;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS operational_status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS max_vehicles_override INTEGER;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS max_rental_requests_override INTEGER;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS storage_gb_override INTEGER;
ALTER TABLE companies ALTER COLUMN operational_status SET DEFAULT 'paused';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS base_currency TEXT NOT NULL DEFAULT 'USD';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS supported_currencies JSONB NOT NULL DEFAULT '["USD"]'::jsonb;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS exchange_rates JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS whatsapp_numbers JSONB NOT NULL DEFAULT '[]'::jsonb;
UPDATE companies SET verified_at=COALESCE(verified_at,created_at) WHERE verification_status='verified' AND verified_at IS NULL;
ALTER TABLE companies ALTER COLUMN verification_status SET DEFAULT 'unsubmitted';
UPDATE companies SET subscription_plan_id=(SELECT id FROM subscription_plans WHERE code='GROWTH'),
  subscription_status='active', subscription_started_at=COALESCE(subscription_started_at,verified_at,created_at)
WHERE verification_status='verified' AND subscription_plan_id IS NULL;
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('renter','company')), company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
  phone TEXT, avatar TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK(role IN ('renter','company','platform_admin'));
CREATE UNIQUE INDEX IF NOT EXISTS users_phone_idx ON users(phone);
CREATE TABLE IF NOT EXISTS phone_verification_codes (
  id SERIAL PRIMARY KEY, phone TEXT NOT NULL, code_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0, expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS phone_verification_phone_idx ON phone_verification_codes(phone);
CREATE INDEX IF NOT EXISTS phone_verification_expiry_idx ON phone_verification_codes(expires_at);
CREATE TABLE IF NOT EXISTS company_verification_requests (
  id SERIAL PRIMARY KEY, company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  submitted_by INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  subscription_plan_id INTEGER NOT NULL REFERENCES subscription_plans(id) ON DELETE RESTRICT,
  attempt INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
  subscription_payment_code TEXT NOT NULL,
  business_registration_name TEXT NOT NULL, business_registration_mime TEXT NOT NULL, business_registration_data TEXT NOT NULL,
  tax_certificate_name TEXT NOT NULL, tax_certificate_mime TEXT NOT NULL, tax_certificate_data TEXT NOT NULL,
  owner_identity_name TEXT NOT NULL, owner_identity_mime TEXT NOT NULL, owner_identity_data TEXT NOT NULL,
  review_notes TEXT, reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL, reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id,attempt)
);
CREATE INDEX IF NOT EXISTS company_verification_status_idx ON company_verification_requests(status);
CREATE INDEX IF NOT EXISTS company_verification_company_idx ON company_verification_requests(company_id);
CREATE UNIQUE INDEX IF NOT EXISTS company_verification_pending_idx ON company_verification_requests(company_id) WHERE status='pending';
CREATE TABLE IF NOT EXISTS platform_bank_accounts (
  id SERIAL PRIMARY KEY, code TEXT NOT NULL UNIQUE, bank_name TEXT NOT NULL DEFAULT 'Al Kuraimi Bank',
  label TEXT NOT NULL, currency TEXT NOT NULL CHECK(currency IN ('SAR','USD','YER')),
  account_number TEXT NOT NULL DEFAULT '', account_holder TEXT NOT NULL DEFAULT 'FleetFlow',
  instructions TEXT NOT NULL DEFAULT '', active BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO platform_bank_accounts(code,label,currency)
VALUES ('KURAIMI_SAR','Kuraimi Bank SAR','SAR'),('KURAIMI_USD','Kuraimi Bank USD','USD'),
  ('KURAIMI_YER_NEW','Kuraimi Bank YER (new)','YER'),('KURAIMI_YER_OLD','Kuraimi Bank YER (old)','YER')
ON CONFLICT (code) DO NOTHING;
CREATE TABLE IF NOT EXISTS payment_gateway_settings (
  id SERIAL PRIMARY KEY, provider TEXT NOT NULL UNIQUE DEFAULT 'kuraimi', enabled BOOLEAN NOT NULL DEFAULT FALSE,
  api_base_url TEXT NOT NULL DEFAULT '', merchant_id TEXT NOT NULL DEFAULT '',
  create_payment_path TEXT NOT NULL DEFAULT '/payments', updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO payment_gateway_settings(provider) VALUES ('kuraimi') ON CONFLICT(provider) DO NOTHING;
CREATE TABLE IF NOT EXISTS platform_payments (
  id SERIAL PRIMARY KEY, company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  subscription_plan_id INTEGER NOT NULL REFERENCES subscription_plans(id) ON DELETE RESTRICT,
  provider TEXT NOT NULL DEFAULT 'kuraimi', amount DOUBLE PRECISION NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD', status TEXT NOT NULL DEFAULT 'created' CHECK(status IN ('created','pending','paid','failed','cancelled')),
  internal_reference TEXT NOT NULL UNIQUE, provider_reference TEXT, checkout_url TEXT,
  idempotency_key TEXT NOT NULL UNIQUE, response_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  paid_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS platform_payments_company_idx ON platform_payments(company_id);
CREATE TABLE IF NOT EXISTS public_support_requests (
  id SERIAL PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT,
  market TEXT NOT NULL CHECK(market IN ('saudi_arabia','yemen','other')),
  topic TEXT NOT NULL CHECK(topic IN ('general','suggestion','inquiry','platform_issue','privacy','legal')),
  subject TEXT NOT NULL, message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','read','closed')),
  source_hash TEXT NOT NULL, consent_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS public_support_created_idx ON public_support_requests(created_at);
CREATE INDEX IF NOT EXISTS public_support_source_idx ON public_support_requests(source_hash);
CREATE INDEX IF NOT EXISTS public_support_status_idx ON public_support_requests(status);
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
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS fuel_level INTEGER NOT NULL DEFAULT 100;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS fuel_policy TEXT NOT NULL DEFAULT 'same_to_same';
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS daily_kilometer_allowance INTEGER NOT NULL DEFAULT 250;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS excess_kilometer_rate DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS insurance_coverage TEXT NOT NULL DEFAULT 'third_party';
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS insurance_provider TEXT NOT NULL DEFAULT '';
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS insurance_policy_number TEXT NOT NULL DEFAULT '';
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS insurance_policy_expiry TIMESTAMPTZ;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS insurance_deductible DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS protection_packages JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS pickup_locations JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS vin TEXT NOT NULL DEFAULT '';
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS images JSONB NOT NULL DEFAULT '[]'::jsonb;
UPDATE vehicles SET pickup_locations = jsonb_build_array(jsonb_build_object('city', location, 'site', location))
WHERE pickup_locations = '[]'::jsonb;
UPDATE vehicles SET
  trim = CASE model WHEN 'C-Class' THEN 'C 300' WHEN '5 Series' THEN '530e' WHEN 'A6' THEN 'Premium Plus' WHEN 'Camry' THEN 'XLE' WHEN 'XC60' THEN 'Ultra' WHEN 'Explorer' THEN 'Limited' WHEN 'Velar' THEN 'Dynamic SE' WHEN 'S-Class' THEN 'S 580e' WHEN 'X7' THEN 'xDrive40i' WHEN 'Panamera' THEN '4 E-Hybrid' WHEN 'Q8' THEN 'Premium Plus' WHEN 'Model Y' THEN 'Long Range' WHEN 'Model 3' THEN 'Long Range' WHEN '2' THEN 'Long Range Dual Motor' WHEN 'EV9' THEN 'GT-Line' WHEN 'Ioniq 5' THEN 'Limited' WHEN 'i5' THEN 'M60' ELSE trim END,
  body_type = CASE WHEN category ILIKE '%SUV%' OR model IN ('Explorer','X7','Q8','Model Y','EV9','Ioniq 5','XC60','Velar') THEN 'SUV' WHEN model IN ('Panamera','2') THEN 'Hatchback' ELSE 'Sedan' END,
  drivetrain = CASE WHEN model IN ('C-Class','Camry','S-Class') THEN 'RWD' WHEN model IN ('Model 3','Ioniq 5') THEN 'RWD' WHEN model IN ('5 Series','A6','XC60','Explorer','Velar','X7','Panamera','Q8','Model Y','2','EV9','i5') THEN 'AWD' ELSE drivetrain END
WHERE trim = 'Standard';
CREATE INDEX IF NOT EXISTS vehicles_company_idx ON vehicles(company_id);
CREATE INDEX IF NOT EXISTS vehicles_status_idx ON vehicles(status);
CREATE TABLE IF NOT EXISTS kilometer_policies (
  id SERIAL PRIMARY KEY, company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
  daily_kilometer_allowance INTEGER NOT NULL, excess_kilometer_rate DOUBLE PRECISION NOT NULL,
  applies_to TEXT NOT NULL DEFAULT 'all' CHECK(applies_to IN ('all','selected')),
  active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(company_id, name)
);
CREATE INDEX IF NOT EXISTS kilometer_policies_company_idx ON kilometer_policies(company_id);
CREATE UNIQUE INDEX IF NOT EXISTS kilometer_policies_fleet_default_idx ON kilometer_policies(company_id) WHERE applies_to = 'all';
CREATE TABLE IF NOT EXISTS kilometer_policy_vehicles (
  policy_id INTEGER NOT NULL REFERENCES kilometer_policies(id) ON DELETE CASCADE,
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS kilometer_policy_vehicle_idx ON kilometer_policy_vehicles(vehicle_id);
CREATE INDEX IF NOT EXISTS kilometer_policy_policy_idx ON kilometer_policy_vehicles(policy_id);
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
CREATE TABLE IF NOT EXISTS insurance_packages (
  id SERIAL PRIMARY KEY, company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL, tier TEXT NOT NULL CHECK(tier IN ('basic','pro','premium','full')),
  description TEXT NOT NULL DEFAULT '', daily_price DOUBLE PRECISION NOT NULL,
  deductible DOUBLE PRECISION NOT NULL DEFAULT 0, coverage JSONB NOT NULL DEFAULT '[]'::jsonb,
  applies_to TEXT NOT NULL DEFAULT 'all' CHECK(applies_to IN ('all','selected')),
  active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(company_id, name)
);
CREATE INDEX IF NOT EXISTS insurance_packages_company_idx ON insurance_packages(company_id);
CREATE TABLE IF NOT EXISTS insurance_package_vehicles (
  package_id INTEGER NOT NULL REFERENCES insurance_packages(id) ON DELETE CASCADE,
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  UNIQUE(package_id, vehicle_id)
);
CREATE TABLE IF NOT EXISTS loyalty_programs (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  points_per_currency DOUBLE PRECISION NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id)
);
CREATE TABLE IF NOT EXISTS loyalty_levels (
  id SERIAL PRIMARY KEY,
  program_id INTEGER NOT NULL REFERENCES loyalty_programs(id) ON DELETE CASCADE,
  rank INTEGER NOT NULL, name TEXT NOT NULL, points_threshold INTEGER NOT NULL,
  discount_percentage DOUBLE PRECISION NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(program_id, rank), UNIQUE(program_id, name)
);
CREATE INDEX IF NOT EXISTS loyalty_levels_program_idx ON loyalty_levels(program_id);
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
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS loyalty_level_id INTEGER REFERENCES loyalty_levels(id) ON DELETE SET NULL;
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS loyalty_level_name TEXT;
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS loyalty_discount_percentage DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS loyalty_discount DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS loyalty_points_rate DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS loyalty_points_earned INTEGER NOT NULL DEFAULT 0;
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS booking_odometer INTEGER NOT NULL DEFAULT 0;
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS renter_odometer_acknowledged BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS renter_odometer_acknowledged_at TIMESTAMPTZ;
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS renter_signature_name TEXT;
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS renter_signed_at TIMESTAMPTZ;
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS handover_by_role TEXT CHECK(handover_by_role IN ('renter','company'));
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS handover_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS invoice_issued_at TIMESTAMPTZ;
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS pickup_city TEXT NOT NULL DEFAULT '';
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS return_city TEXT NOT NULL DEFAULT '';
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS return_location TEXT NOT NULL DEFAULT '';
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS promo_details JSONB NOT NULL DEFAULT '[]';
UPDATE rentals SET pickup_city = pickup_location WHERE pickup_city = '';
UPDATE rentals SET return_city = return_location WHERE return_city = '' AND return_location <> '';
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS protection_package_id INTEGER REFERENCES insurance_packages(id) ON DELETE SET NULL;
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS protection_tier TEXT NOT NULL DEFAULT 'basic';
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS protection_name TEXT NOT NULL DEFAULT 'Basic';
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS protection_daily_price DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS protection_days INTEGER NOT NULL DEFAULT 1;
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS protection_subtotal DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS protection_deductible DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS protection_coverage JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS fuel_charge DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS pickup_odometer INTEGER;
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS return_odometer INTEGER;
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS pickup_fuel_level INTEGER;
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS return_fuel_level INTEGER;
-- Preserve the known stage of existing rentals without inventing a historical signer.
UPDATE rentals SET confirmed_at = COALESCE(confirmed_at, starts_at)
WHERE status IN ('active','completed') OR pickup_odometer IS NOT NULL;
UPDATE rentals SET
  renter_odometer_acknowledged = TRUE,
  renter_odometer_acknowledged_at = COALESCE(renter_odometer_acknowledged_at, starts_at),
  invoice_issued_at = COALESCE(invoice_issued_at, starts_at)
WHERE pickup_odometer IS NOT NULL;
UPDATE rentals SET paid_at = COALESCE(paid_at, ends_at) WHERE status = 'completed';
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS daily_kilometer_allowance INTEGER NOT NULL DEFAULT 0;
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS allowed_kilometers INTEGER;
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS excess_kilometer_rate DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS kilometer_policy_id INTEGER REFERENCES kilometer_policies(id) ON DELETE SET NULL;
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS kilometer_policy_name TEXT NOT NULL DEFAULT 'Vehicle mileage terms';
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS excess_distance_charge DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS invoice_token TEXT;
UPDATE rentals SET invoice_token = 'legacy-' || id::text WHERE invoice_token IS NULL;
ALTER TABLE rentals ALTER COLUMN invoice_token SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS rentals_invoice_token_idx ON rentals(invoice_token);
CREATE INDEX IF NOT EXISTS rentals_vehicle_idx ON rentals(vehicle_id);
CREATE INDEX IF NOT EXISTS rentals_renter_idx ON rentals(renter_id);
CREATE INDEX IF NOT EXISTS rentals_status_idx ON rentals(status);
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'USD';
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS exchange_rate DOUBLE PRECISION NOT NULL DEFAULT 1;
CREATE TABLE IF NOT EXISTS rental_services (
  id SERIAL PRIMARY KEY, rental_id INTEGER NOT NULL REFERENCES rentals(id) ON DELETE CASCADE,
  service_id INTEGER REFERENCES premium_services(id) ON DELETE SET NULL,
  name TEXT NOT NULL, unit_price DOUBLE PRECISION NOT NULL, days INTEGER NOT NULL,
  discount DOUBLE PRECISION NOT NULL DEFAULT 0, subtotal DOUBLE PRECISION NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS rental_services_rental_idx ON rental_services(rental_id);
CREATE TABLE IF NOT EXISTS loyalty_point_ledger (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  renter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rental_id INTEGER NOT NULL REFERENCES rentals(id) ON DELETE CASCADE,
  points INTEGER NOT NULL, eligible_spend DOUBLE PRECISION NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(rental_id)
);
CREATE INDEX IF NOT EXISTS loyalty_point_ledger_member_idx ON loyalty_point_ledger(company_id, renter_id);
CREATE TABLE IF NOT EXISTS vehicle_condition_logs (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  rental_id INTEGER REFERENCES rentals(id) ON DELETE SET NULL,
  recorded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK(event_type IN ('manual','pickup','return','refuel')),
  odometer INTEGER NOT NULL, fuel_level INTEGER NOT NULL CHECK(fuel_level BETWEEN 0 AND 100),
  fuel_added_liters DOUBLE PRECISION, fuel_cost DOUBLE PRECISION, notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS vehicle_condition_logs_company_idx ON vehicle_condition_logs(company_id);
CREATE INDEX IF NOT EXISTS vehicle_condition_logs_vehicle_idx ON vehicle_condition_logs(vehicle_id);
CREATE INDEX IF NOT EXISTS vehicle_condition_logs_rental_idx ON vehicle_condition_logs(rental_id);
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
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'USD';
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
CREATE TABLE IF NOT EXISTS saved_vehicles (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, vehicle_id)
);
CREATE INDEX IF NOT EXISTS saved_vehicles_vehicle_idx ON saved_vehicles(vehicle_id);
`;

type Store = { promise?: Promise<any>; db?: any; raw?: any; imagesReady?: Promise<void> };
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
  const [platformAdmin] = await db.select({ id:schema.users.id }).from(schema.users)
    .where(eq(schema.users.role, 'platform_admin')).limit(1);
  if (!platformAdmin) {
    const passwordHash = await bcrypt.hash(process.env.PLATFORM_ADMIN_PASSWORD || 'demo1234', 10);
    const [admin] = await db.insert(schema.users).values({
      name:'FleetFlow Platform Admin', email:process.env.PLATFORM_ADMIN_EMAIL || 'admin@fleetflow.com',
      passwordHash, role:'platform_admin', avatar:'PA',
    }).onConflictDoNothing().returning();
    if (admin) await db.insert(schema.userSettings).values({ userId:admin.id }).onConflictDoNothing();
  }
  store.db = db;
  return db;
}

export async function getDb() {
  if (store.db) {
    if (store.raw && !store.imagesReady) {
      store.imagesReady = process.env.DATABASE_URL
        ? store.raw.unsafe(`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS images JSONB NOT NULL DEFAULT '[]'::jsonb`)
        : store.raw.exec(`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS images JSONB NOT NULL DEFAULT '[]'::jsonb`);
    }
    if (store.imagesReady) await store.imagesReady;
    return store.db;
  }
  store.promise ||= initialize();
  return store.promise;
}

export async function resetDatabase() {
  const db = await getDb();
  await db.execute(sql.raw('TRUNCATE TABLE phone_verification_codes, public_support_requests, company_verification_requests, platform_payments, kilometer_policy_vehicles, kilometer_policies, notifications, saved_vehicles, user_settings, support_messages, support_tickets, maintenance_work_orders, maintenance_items, vehicle_condition_logs, loyalty_point_ledger, promotion_vehicles, insurance_package_vehicles, rental_services, rentals, loyalty_levels, loyalty_programs, insurance_packages, premium_services, promotions, vehicles, users, companies RESTART IDENTITY CASCADE'));
  await seedDatabase(db);
}
