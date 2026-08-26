import { sql } from 'drizzle-orm';
import { boolean, doublePrecision, index, integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import type { ProtectionPackage, ProtectionTier } from '@/lib/insurance';

export type PickupLocationOption = { city: string; site: string };
export type AccountRole = 'renter' | 'company' | 'platform_admin';
export type CompanyVerificationStatus = 'unsubmitted' | 'pending' | 'verified' | 'rejected';
export type CompanyOperationalStatus = 'active' | 'paused' | 'deactivated';

export const subscriptionPlans = pgTable('subscription_plans', {
  id: serial('id').primaryKey(),
  code: text('code').notNull(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  monthlyPriceUsd: doublePrecision('monthly_price_usd').notNull(),
  maxVehicles: integer('max_vehicles').notNull(),
  maxRentalRequests: integer('max_rental_requests').notNull(),
  storageGb: integer('storage_gb').notNull(),
  features: jsonb('features').$type<string[]>().notNull().default([]),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex('subscription_plans_code_idx').on(table.code)]);

export const companies = pgTable('companies', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  logo: text('logo'),
  city: text('city').notNull().default('San Francisco'),
  verificationStatus: text('verification_status').$type<CompanyVerificationStatus>().notNull().default('unsubmitted'),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  subscriptionPlanId: integer('subscription_plan_id').references(() => subscriptionPlans.id, { onDelete: 'set null' }),
  subscriptionStatus: text('subscription_status').$type<'inactive' | 'active' | 'past_due' | 'cancelled'>().notNull().default('inactive'),
  subscriptionStartedAt: timestamp('subscription_started_at', { withTimezone: true }),
  operationalStatus: text('operational_status').$type<CompanyOperationalStatus>().notNull().default('paused'),
  maxVehiclesOverride: integer('max_vehicles_override'),
  maxRentalRequestsOverride: integer('max_rental_requests_override'),
  storageGbOverride: integer('storage_gb_override'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').$type<AccountRole>().notNull(),
  companyId: integer('company_id').references(() => companies.id, { onDelete: 'set null' }),
  phone: text('phone'),
  avatar: text('avatar'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('users_email_idx').on(table.email),
  uniqueIndex('users_phone_idx').on(table.phone),
]);

export const phoneVerificationCodes = pgTable('phone_verification_codes', {
  id: serial('id').primaryKey(),
  phone: text('phone').notNull(),
  codeHash: text('code_hash').notNull(),
  attempts: integer('attempts').notNull().default(0),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  consumedAt: timestamp('consumed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('phone_verification_phone_idx').on(table.phone),
  index('phone_verification_expiry_idx').on(table.expiresAt),
]);

export const companyVerificationRequests = pgTable('company_verification_requests', {
  id: serial('id').primaryKey(),
  companyId: integer('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  submittedBy: integer('submitted_by').notNull().references(() => users.id, { onDelete: 'restrict' }),
  subscriptionPlanId: integer('subscription_plan_id').notNull().references(() => subscriptionPlans.id, { onDelete: 'restrict' }),
  attempt: integer('attempt').notNull(),
  status: text('status').$type<'pending' | 'approved' | 'rejected'>().notNull().default('pending'),
  subscriptionPaymentCode: text('subscription_payment_code').notNull(),
  businessRegistrationName: text('business_registration_name').notNull(),
  businessRegistrationMime: text('business_registration_mime').notNull(),
  businessRegistrationData: text('business_registration_data').notNull(),
  taxCertificateName: text('tax_certificate_name').notNull(),
  taxCertificateMime: text('tax_certificate_mime').notNull(),
  taxCertificateData: text('tax_certificate_data').notNull(),
  ownerIdentityName: text('owner_identity_name').notNull(),
  ownerIdentityMime: text('owner_identity_mime').notNull(),
  ownerIdentityData: text('owner_identity_data').notNull(),
  reviewNotes: text('review_notes'),
  reviewedBy: integer('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('company_verification_attempt_idx').on(table.companyId, table.attempt),
  index('company_verification_status_idx').on(table.status),
  index('company_verification_company_idx').on(table.companyId),
]);

export const platformBankAccounts = pgTable('platform_bank_accounts', {
  id: serial('id').primaryKey(),
  code: text('code').$type<'KURAIMI_SAR' | 'KURAIMI_USD' | 'KURAIMI_YER_NEW' | 'KURAIMI_YER_OLD'>().notNull(),
  bankName: text('bank_name').notNull().default('Al Kuraimi Bank'),
  label: text('label').notNull(),
  currency: text('currency').$type<'SAR' | 'USD' | 'YER'>().notNull(),
  accountNumber: text('account_number').notNull().default(''),
  accountHolder: text('account_holder').notNull().default('FleetFlow'),
  instructions: text('instructions').notNull().default(''),
  active: boolean('active').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex('platform_bank_accounts_code_idx').on(table.code)]);

export const paymentGatewaySettings = pgTable('payment_gateway_settings', {
  id: serial('id').primaryKey(),
  provider: text('provider').notNull().default('kuraimi'),
  enabled: boolean('enabled').notNull().default(false),
  apiBaseUrl: text('api_base_url').notNull().default(''),
  merchantId: text('merchant_id').notNull().default(''),
  createPaymentPath: text('create_payment_path').notNull().default('/payments'),
  updatedBy: integer('updated_by').references(() => users.id, { onDelete: 'set null' }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex('payment_gateway_provider_idx').on(table.provider)]);

export const platformPayments = pgTable('platform_payments', {
  id: serial('id').primaryKey(),
  companyId: integer('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  subscriptionPlanId: integer('subscription_plan_id').notNull().references(() => subscriptionPlans.id, { onDelete: 'restrict' }),
  provider: text('provider').notNull().default('kuraimi'),
  amount: doublePrecision('amount').notNull(),
  currency: text('currency').notNull().default('USD'),
  status: text('status').$type<'created' | 'pending' | 'paid' | 'failed' | 'cancelled'>().notNull().default('created'),
  internalReference: text('internal_reference').notNull(),
  providerReference: text('provider_reference'),
  checkoutUrl: text('checkout_url'),
  idempotencyKey: text('idempotency_key').notNull(),
  responseData: jsonb('response_data').$type<Record<string, unknown>>().notNull().default({}),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('platform_payments_reference_idx').on(table.internalReference),
  uniqueIndex('platform_payments_idempotency_idx').on(table.idempotencyKey),
  index('platform_payments_company_idx').on(table.companyId),
]);

export const publicSupportRequests = pgTable('public_support_requests', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  phone: text('phone'),
  market: text('market').$type<'saudi_arabia' | 'yemen' | 'other'>().notNull(),
  topic: text('topic').$type<'general' | 'suggestion' | 'inquiry' | 'platform_issue' | 'privacy' | 'legal'>().notNull(),
  subject: text('subject').notNull(),
  message: text('message').notNull(),
  status: text('status').$type<'new' | 'read' | 'closed'>().notNull().default('new'),
  sourceHash: text('source_hash').notNull(),
  consentAt: timestamp('consent_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('public_support_created_idx').on(table.createdAt),
  index('public_support_source_idx').on(table.sourceHash),
  index('public_support_status_idx').on(table.status),
]);

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
  vin: text('vin').notNull().default(''),
  odometer: integer('odometer').notNull().default(0),
  fuelLevel: integer('fuel_level').notNull().default(100),
  fuelPolicy: text('fuel_policy').$type<'same_to_same' | 'full_to_full' | 'prepaid'>().notNull().default('same_to_same'),
  dailyKilometerAllowance: integer('daily_kilometer_allowance').notNull().default(250),
  excessKilometerRate: doublePrecision('excess_kilometer_rate').notNull().default(0),
  insuranceCoverage: text('insurance_coverage').$type<'third_party' | 'comprehensive'>().notNull().default('third_party'),
  insuranceProvider: text('insurance_provider').notNull().default(''),
  insurancePolicyNumber: text('insurance_policy_number').notNull().default(''),
  insurancePolicyExpiry: timestamp('insurance_policy_expiry', { withTimezone: true }),
  insuranceDeductible: doublePrecision('insurance_deductible').notNull().default(0),
  protectionPackages: jsonb('protection_packages').$type<ProtectionPackage[]>().notNull().default([]),
  location: text('location').notNull(),
  pickupLocations: jsonb('pickup_locations').$type<PickupLocationOption[]>().notNull().default([]),
  features: jsonb('features').$type<string[]>().notNull().default([]),
  image: text('image').notNull(),
  images: jsonb('images').$type<string[]>().notNull().default([]),
  status: text('status').$type<'available' | 'maintenance' | 'retired'>().notNull().default('available'),
  hourlyRate: doublePrecision('hourly_rate').notNull(),
  dailyRate: doublePrecision('daily_rate').notNull(),
  weeklyRate: doublePrecision('weekly_rate').notNull(),
  monthlyRate: doublePrecision('monthly_rate').notNull(),
  rating: doublePrecision('rating').notNull().default(4.8),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index('vehicles_company_idx').on(table.companyId), index('vehicles_status_idx').on(table.status)]);

export const kilometerPolicies = pgTable('kilometer_policies', {
  id: serial('id').primaryKey(),
  companyId: integer('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  dailyKilometerAllowance: integer('daily_kilometer_allowance').notNull(),
  excessKilometerRate: doublePrecision('excess_kilometer_rate').notNull(),
  appliesTo: text('applies_to').$type<'all' | 'selected'>().notNull().default('all'),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('kilometer_policies_company_idx').on(table.companyId),
  uniqueIndex('kilometer_policies_company_name_idx').on(table.companyId, table.name),
  uniqueIndex('kilometer_policies_fleet_default_idx').on(table.companyId).where(sql`${table.appliesTo} = 'all'`),
]);

export const kilometerPolicyVehicles = pgTable('kilometer_policy_vehicles', {
  policyId: integer('policy_id').notNull().references(() => kilometerPolicies.id, { onDelete: 'cascade' }),
  vehicleId: integer('vehicle_id').notNull().references(() => vehicles.id, { onDelete: 'cascade' }),
}, (table) => [
  uniqueIndex('kilometer_policy_vehicle_idx').on(table.vehicleId),
  index('kilometer_policy_policy_idx').on(table.policyId),
]);

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

export const insurancePackages = pgTable('insurance_packages', {
  id: serial('id').primaryKey(),
  companyId: integer('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  tier: text('tier').$type<ProtectionTier>().notNull(),
  description: text('description').notNull().default(''),
  dailyPrice: doublePrecision('daily_price').notNull(),
  deductible: doublePrecision('deductible').notNull().default(0),
  coverage: jsonb('coverage').$type<string[]>().notNull().default([]),
  appliesTo: text('applies_to').$type<'all' | 'selected'>().notNull().default('all'),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('insurance_packages_company_idx').on(table.companyId),
  uniqueIndex('insurance_packages_company_name_idx').on(table.companyId, table.name),
]);

export const insurancePackageVehicles = pgTable('insurance_package_vehicles', {
  packageId: integer('package_id').notNull().references(() => insurancePackages.id, { onDelete: 'cascade' }),
  vehicleId: integer('vehicle_id').notNull().references(() => vehicles.id, { onDelete: 'cascade' }),
}, (table) => [uniqueIndex('insurance_package_vehicle_idx').on(table.packageId, table.vehicleId)]);

export const loyaltyPrograms = pgTable('loyalty_programs', {
  id: serial('id').primaryKey(),
  companyId: integer('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  enabled: boolean('enabled').notNull().default(false),
  pointsPerCurrency: doublePrecision('points_per_currency').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex('loyalty_programs_company_idx').on(table.companyId)]);

export const loyaltyLevels = pgTable('loyalty_levels', {
  id: serial('id').primaryKey(),
  programId: integer('program_id').notNull().references(() => loyaltyPrograms.id, { onDelete: 'cascade' }),
  rank: integer('rank').notNull(),
  name: text('name').notNull(),
  pointsThreshold: integer('points_threshold').notNull(),
  discountPercentage: doublePrecision('discount_percentage').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('loyalty_levels_program_rank_idx').on(table.programId, table.rank),
  uniqueIndex('loyalty_levels_program_name_idx').on(table.programId, table.name),
]);

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
  loyaltyLevelId: integer('loyalty_level_id').references(() => loyaltyLevels.id, { onDelete: 'set null' }),
  loyaltyLevelName: text('loyalty_level_name'),
  loyaltyDiscountPercentage: doublePrecision('loyalty_discount_percentage').notNull().default(0),
  loyaltyDiscount: doublePrecision('loyalty_discount').notNull().default(0),
  loyaltyPointsRate: doublePrecision('loyalty_points_rate').notNull().default(0),
  loyaltyPointsEarned: integer('loyalty_points_earned').notNull().default(0),
  extrasSubtotal: doublePrecision('extras_subtotal').notNull().default(0),
  bookingOdometer: integer('booking_odometer').notNull().default(0),
  renterOdometerAcknowledged: boolean('renter_odometer_acknowledged').notNull().default(false),
  renterOdometerAcknowledgedAt: timestamp('renter_odometer_acknowledged_at', { withTimezone: true }),
  confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
  renterSignatureName: text('renter_signature_name'),
  renterSignedAt: timestamp('renter_signed_at', { withTimezone: true }),
  handoverByRole: text('handover_by_role').$type<'renter' | 'company'>(),
  handoverByUserId: integer('handover_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  invoiceIssuedAt: timestamp('invoice_issued_at', { withTimezone: true }),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  protectionPackageId: integer('protection_package_id').references(() => insurancePackages.id, { onDelete: 'set null' }),
  protectionTier: text('protection_tier').$type<ProtectionTier>().notNull().default('basic'),
  protectionName: text('protection_name').notNull().default('Basic'),
  protectionDailyPrice: doublePrecision('protection_daily_price').notNull().default(0),
  protectionDays: integer('protection_days').notNull().default(1),
  protectionSubtotal: doublePrecision('protection_subtotal').notNull().default(0),
  protectionDeductible: doublePrecision('protection_deductible').notNull().default(0),
  protectionCoverage: jsonb('protection_coverage').$type<string[]>().notNull().default([]),
  extraDiscount: doublePrecision('extra_discount').notNull().default(0),
  fuelCharge: doublePrecision('fuel_charge').notNull().default(0),
  pickupOdometer: integer('pickup_odometer'),
  returnOdometer: integer('return_odometer'),
  pickupFuelLevel: integer('pickup_fuel_level'),
  returnFuelLevel: integer('return_fuel_level'),
  dailyKilometerAllowance: integer('daily_kilometer_allowance').notNull().default(0),
  allowedKilometers: integer('allowed_kilometers'),
  excessKilometerRate: doublePrecision('excess_kilometer_rate').notNull().default(0),
  kilometerPolicyId: integer('kilometer_policy_id').references(() => kilometerPolicies.id, { onDelete: 'set null' }),
  kilometerPolicyName: text('kilometer_policy_name').notNull().default('Vehicle mileage terms'),
  excessDistanceCharge: doublePrecision('excess_distance_charge').notNull().default(0),
  total: doublePrecision('total').notNull(),
  promoCode: text('promo_code'),
  invoiceToken: text('invoice_token').notNull(),
  pickupCity: text('pickup_city').notNull().default(''),
  pickupLocation: text('pickup_location').notNull(),
  returnCity: text('return_city').notNull().default(''),
  returnLocation: text('return_location').notNull().default(''),
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

export const loyaltyPointLedger = pgTable('loyalty_point_ledger', {
  id: serial('id').primaryKey(),
  companyId: integer('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  renterId: integer('renter_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  rentalId: integer('rental_id').notNull().references(() => rentals.id, { onDelete: 'cascade' }),
  points: integer('points').notNull(),
  eligibleSpend: doublePrecision('eligible_spend').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('loyalty_point_ledger_rental_idx').on(table.rentalId),
  index('loyalty_point_ledger_member_idx').on(table.companyId, table.renterId),
]);

export const vehicleConditionLogs = pgTable('vehicle_condition_logs', {
  id: serial('id').primaryKey(),
  companyId: integer('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  vehicleId: integer('vehicle_id').notNull().references(() => vehicles.id, { onDelete: 'cascade' }),
  rentalId: integer('rental_id').references(() => rentals.id, { onDelete: 'set null' }),
  recordedBy: integer('recorded_by').references(() => users.id, { onDelete: 'set null' }),
  eventType: text('event_type').$type<'manual' | 'pickup' | 'return' | 'refuel'>().notNull(),
  odometer: integer('odometer').notNull(),
  fuelLevel: integer('fuel_level').notNull(),
  fuelAddedLiters: doublePrecision('fuel_added_liters'),
  fuelCost: doublePrecision('fuel_cost'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('vehicle_condition_logs_company_idx').on(table.companyId),
  index('vehicle_condition_logs_vehicle_idx').on(table.vehicleId),
  index('vehicle_condition_logs_rental_idx').on(table.rentalId),
]);

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

export type SubscriptionPlan = typeof subscriptionPlans.$inferSelect;
export type CompanyVerificationRequest = typeof companyVerificationRequests.$inferSelect;
export type PlatformBankAccount = typeof platformBankAccounts.$inferSelect;
export type PlatformPayment = typeof platformPayments.$inferSelect;
export type Vehicle = typeof vehicles.$inferSelect;
export type Rental = typeof rentals.$inferSelect;
export type Promotion = typeof promotions.$inferSelect;
export type PremiumService = typeof premiumServices.$inferSelect;
export type InsurancePackage = typeof insurancePackages.$inferSelect;
export type LoyaltyProgram = typeof loyaltyPrograms.$inferSelect;
export type LoyaltyLevel = typeof loyaltyLevels.$inferSelect;
export type VehicleConditionLog = typeof vehicleConditionLogs.$inferSelect;
export type SupportTicket = typeof supportTickets.$inferSelect;
export type SupportMessage = typeof supportMessages.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type MaintenanceItem = typeof maintenanceItems.$inferSelect;
export type MaintenanceWorkOrder = typeof maintenanceWorkOrders.$inferSelect;
export type UserSettings = typeof userSettings.$inferSelect;
export type User = typeof users.$inferSelect;
