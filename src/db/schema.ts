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
  trim: text('trim').notNull().default('Standard'),
  year: integer('year').notNull(),
  category: text('category').notNull(),
  bodyType: text('body_type').notNull().default('Sedan'),
  gearbox: text('gearbox').notNull().default('Automatic'),
  drivetrain: text('drivetrain').notNull().default('FWD'),
  steeringType: text('steering_type').notNull().default('Left-hand drive'),
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

export const premiumServices = pgTable('premium_services', {
  id: serial('id').primaryKey(),
  companyId: integer('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  key: text('key').notNull(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  dailyPrice: doublePrecision('daily_price').notNull(),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex('premium_services_company_key_idx').on(table.companyId, table.key)]);

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
  extrasSubtotal: doublePrecision('extras_subtotal').notNull().default(0),
  extraDiscount: doublePrecision('extra_discount').notNull().default(0),
  total: doublePrecision('total').notNull(),
  promoCode: text('promo_code'),
  invoiceToken: text('invoice_token').notNull(),
  pickupLocation: text('pickup_location').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index('rentals_vehicle_idx').on(table.vehicleId), index('rentals_renter_idx').on(table.renterId), index('rentals_status_idx').on(table.status), uniqueIndex('rentals_invoice_token_idx').on(table.invoiceToken)]);

export const rentalServices = pgTable('rental_services', {
  id: serial('id').primaryKey(),
  rentalId: integer('rental_id').notNull().references(() => rentals.id, { onDelete: 'cascade' }),
  serviceId: integer('service_id').references(() => premiumServices.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  unitPrice: doublePrecision('unit_price').notNull(),
  days: integer('days').notNull(),
  discount: doublePrecision('discount').notNull().default(0),
  subtotal: doublePrecision('subtotal').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index('rental_services_rental_idx').on(table.rentalId)]);

export const supportTickets = pgTable('support_tickets', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  companyId: integer('company_id').references(() => companies.id, { onDelete: 'set null' }),
  rentalId: integer('rental_id').references(() => rentals.id, { onDelete: 'set null' }),
  subject: text('subject').notNull(),
  category: text('category').$type<'booking' | 'billing' | 'vehicle' | 'account' | 'technical' | 'other'>().notNull(),
  priority: text('priority').$type<'normal' | 'urgent'>().notNull().default('normal'),
  status: text('status').$type<'open' | 'waiting' | 'resolved'>().notNull().default('open'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('support_tickets_user_idx').on(table.userId),
  index('support_tickets_company_idx').on(table.companyId),
  index('support_tickets_status_idx').on(table.status),
]);

export const supportMessages = pgTable('support_messages', {
  id: serial('id').primaryKey(),
  ticketId: integer('ticket_id').notNull().references(() => supportTickets.id, { onDelete: 'cascade' }),
  senderType: text('sender_type').$type<'customer' | 'company' | 'support'>().notNull(),
  senderUserId: integer('sender_user_id').references(() => users.id, { onDelete: 'set null' }),
  body: text('body').notNull(),
  automated: boolean('automated').notNull().default(false),
  readAt: timestamp('read_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index('support_messages_ticket_idx').on(table.ticketId), index('support_messages_unread_idx').on(table.readAt)]);

export const maintenanceItems = pgTable('maintenance_items', {
  id: serial('id').primaryKey(),
  companyId: integer('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  key: text('key').notNull(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  intervalDays: integer('interval_days'),
  intervalKm: integer('interval_km'),
  defaultDurationHours: doublePrecision('default_duration_hours').notNull().default(1),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex('maintenance_items_company_key_idx').on(table.companyId, table.key)]);

export const maintenanceWorkOrders = pgTable('maintenance_work_orders', {
  id: serial('id').primaryKey(),
  companyId: integer('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  vehicleId: integer('vehicle_id').notNull().references(() => vehicles.id, { onDelete: 'cascade' }),
  itemId: integer('item_id').references(() => maintenanceItems.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  status: text('status').$type<'scheduled' | 'in_progress' | 'completed' | 'cancelled'>().notNull().default('scheduled'),
  priority: text('priority').$type<'routine' | 'soon' | 'urgent'>().notNull().default('routine'),
  dueAt: timestamp('due_at', { withTimezone: true }).notNull(),
  dueOdometer: integer('due_odometer'),
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull(),
  durationHours: doublePrecision('duration_hours').notNull().default(1),
  vendor: text('vendor'),
  cost: doublePrecision('cost').notNull().default(0),
  notes: text('notes'),
  recurrenceDays: integer('recurrence_days'),
  recurrenceKm: integer('recurrence_km'),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  completedOdometer: integer('completed_odometer'),
  waybillName: text('waybill_name'),
  waybillMime: text('waybill_mime'),
  waybillData: text('waybill_data'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('maintenance_work_orders_company_idx').on(table.companyId),
  index('maintenance_work_orders_vehicle_idx').on(table.vehicleId),
  index('maintenance_work_orders_status_idx').on(table.status),
  index('maintenance_work_orders_due_idx').on(table.dueAt),
]);

export const userSettings = pgTable('user_settings', {
  userId: integer('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  emailNotifications: boolean('email_notifications').notNull().default(true),
  inAppNotifications: boolean('in_app_notifications').notNull().default(true),
  rentalNotifications: boolean('rental_notifications').notNull().default(true),
  messageNotifications: boolean('message_notifications').notNull().default(true),
  billingNotifications: boolean('billing_notifications').notNull().default(true),
  marketingNotifications: boolean('marketing_notifications').notNull().default(false),
  weeklySummary: boolean('weekly_summary').notNull().default(true),
  language: text('language').$type<'en' | 'ar'>().notNull().default('en'),
  theme: text('theme').$type<'light' | 'dark'>().notNull().default('light'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const notifications = pgTable('notifications', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }),
  companyId: integer('company_id').references(() => companies.id, { onDelete: 'cascade' }),
  type: text('type').$type<'support_message' | 'support_reply' | 'support_status' | 'rental_created' | 'rental_status' | 'billing_updated' | 'maintenance_due' | 'maintenance_overdue' | 'maintenance_conflict' | 'system'>().notNull(),
  body: text('body').notNull(),
  href: text('href').notNull(),
  entityType: text('entity_type'),
  entityId: integer('entity_id'),
  dedupeKey: text('dedupe_key').unique(),
  readAt: timestamp('read_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('notifications_user_idx').on(table.userId),
  index('notifications_company_idx').on(table.companyId),
  index('notifications_read_idx').on(table.readAt),
]);

export type Vehicle = typeof vehicles.$inferSelect;
export type Rental = typeof rentals.$inferSelect;
export type Promotion = typeof promotions.$inferSelect;
export type PremiumService = typeof premiumServices.$inferSelect;
export type SupportTicket = typeof supportTickets.$inferSelect;
export type SupportMessage = typeof supportMessages.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type MaintenanceItem = typeof maintenanceItems.$inferSelect;
export type MaintenanceWorkOrder = typeof maintenanceWorkOrders.$inferSelect;
export type UserSettings = typeof userSettings.$inferSelect;
export type User = typeof users.$inferSelect;
