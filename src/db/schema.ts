import { boolean, doublePrecision, index, integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

export const companies = pgTable('companies', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  logo: text('logo'),
  city: text('city').notNull().default('San Francisco'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').$type<'renter' | 'company'>().notNull(),
  companyId: integer('company_id').references(() => companies.id, { onDelete: 'set null' }),
  phone: text('phone'),
  avatar: text('avatar'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex('users_email_idx').on(table.email)]);

export const vehicles = pgTable('vehicles', {
  id: serial('id').primaryKey(),
  companyId: integer('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  make: text('make').notNull(),
  model: text('model').notNull(),
  year: integer('year').notNull(),
  category: text('category').notNull(),
  gearbox: text('gearbox').notNull().default('Automatic'),
  fuel: text('fuel').notNull().default('Petrol'),
  seats: integer('seats').notNull().default(5),
  color: text('color').notNull(),
  licensePlate: text('license_plate').notNull(),
  odometer: integer('odometer').notNull().default(0),
  location: text('location').notNull(),
  features: jsonb('features').$type<string[]>().notNull().default([]),
  image: text('image').notNull(),
  status: text('status').$type<'available' | 'maintenance' | 'retired'>().notNull().default('available'),
  hourlyRate: doublePrecision('hourly_rate').notNull(),
  dailyRate: doublePrecision('daily_rate').notNull(),
  weeklyRate: doublePrecision('weekly_rate').notNull(),
  monthlyRate: doublePrecision('monthly_rate').notNull(),
  rating: doublePrecision('rating').notNull().default(4.8),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index('vehicles_company_idx').on(table.companyId), index('vehicles_status_idx').on(table.status)]);

export const promotions = pgTable('promotions', {
  id: serial('id').primaryKey(),
  companyId: integer('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  code: text('code').notNull(),
  type: text('type').$type<'percentage' | 'fixed'>().notNull(),
  value: doublePrecision('value').notNull(),
  appliesTo: text('applies_to').$type<'all' | 'selected'>().notNull().default('all'),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
  enabled: boolean('enabled').notNull().default(true),
  minQuantity: integer('min_quantity').notNull().default(1),
  redemptions: integer('redemptions').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex('promotions_company_code_idx').on(table.companyId, table.code)]);

export const promotionVehicles = pgTable('promotion_vehicles', {
  promotionId: integer('promotion_id').notNull().references(() => promotions.id, { onDelete: 'cascade' }),
  vehicleId: integer('vehicle_id').notNull().references(() => vehicles.id, { onDelete: 'cascade' }),
}, (table) => [uniqueIndex('promotion_vehicle_idx').on(table.promotionId, table.vehicleId)]);

export const rentals = pgTable('rentals', {
  id: serial('id').primaryKey(),
  vehicleId: integer('vehicle_id').notNull().references(() => vehicles.id, { onDelete: 'restrict' }),
  renterId: integer('renter_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  status: text('status').$type<'pending' | 'active' | 'completed' | 'cancelled'>().notNull().default('pending'),
  rateType: text('rate_type').$type<'hour' | 'day' | 'week' | 'month'>().notNull(),
  quantity: integer('quantity').notNull(),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
  subtotal: doublePrecision('subtotal').notNull(),
  discount: doublePrecision('discount').notNull().default(0),
  total: doublePrecision('total').notNull(),
  promoCode: text('promo_code'),
  pickupLocation: text('pickup_location').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index('rentals_vehicle_idx').on(table.vehicleId), index('rentals_renter_idx').on(table.renterId), index('rentals_status_idx').on(table.status)]);

export type Vehicle = typeof vehicles.$inferSelect;
export type Rental = typeof rentals.$inferSelect;
export type Promotion = typeof promotions.$inferSelect;
export type User = typeof users.$inferSelect;
