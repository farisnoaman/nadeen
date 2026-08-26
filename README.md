# FleetFlow — Full-stack car rental marketplace

FleetFlow is a role-aware car rental marketplace and fleet operations platform. Guests can browse the complete available-vehicle marketplace before creating an account and are asked to sign in only when they start a rental. Rental companies manage vehicles, locations, pricing, insurance, maintenance, telemetry, promotions, services, bookings, and reports; authenticated renters select protected rental periods, choose pickup and return sites, and receive complete online and PDF rental documents.

The application is built with **Next.js 16**, **React 19**, **Drizzle ORM**, and **PostgreSQL**. When `DATABASE_URL` is not configured, the same application runs locally on persistent **PGlite** data. FleetFlow supports English and Arabic, complete RTL rendering, responsive layouts, direct light/dark switching, and print-ready A4 documents.

## Feature overview

### Public website, legal information, and guest support

- The public landing page includes a detailed fleet-operations capability showcase plus functional links to `/browse`, `/privacy`, `/terms`, and `/support`.
- `/privacy` provides a bilingual, responsive privacy notice for FleetFlow's Saudi Arabia and Yemen operations, including processing purposes, user rights, retention, security, transfers, and market-specific official references.
- `/terms` separates shared platform conditions from selectable Saudi Arabia and Yemen market schedules, so local rental, contract, licensing, traffic, insurance, and responsibility conditions are not presented as one undifferentiated policy.
- `/support` is available without an account and contains searchable English/Arabic FAQs and a public form for general topics, suggestions, inquiries, privacy/legal questions, and FleetFlow platform issues.
- Public support intentionally excludes booking, payment, pickup, return, accident, damage, and rental-company disputes. Those matters are routed to the authenticated, rental-linked `/dashboard/support` workspace so the correct rental company receives the conversation.
- Public management requests are persisted in `public_support_requests`, receive references such as `FF-WEB-000123`, and may also be delivered to a configured management webhook. Delivery failure never discards the stored request.
- The public form validates bounded input, includes consent and a bot-trap field, stores only an HMAC-pseudonymized source identifier, and permits three stored submissions per source in a rolling 15-minute window.

### Renter marketplace and booking

- Browse the complete currently available marketplace, vehicle details, pickup networks, prices, promotions, and busy periods without creating an account.
- Sign in only when starting a rental; FleetFlow returns the renter to the selected vehicle and opens booking automatically after authentication.
- Filter by:
  - Pickup city
  - Make → model → trim
  - Fuel type
  - Body type
  - Transmission
  - Drivetrain
  - Steering type
  - Color
  - Year range
  - Estimated minimum/maximum price
- Sort by price or year and switch displayed rates between hour, day, week, and month.
- View each vehicle’s company, specifications, pickup cities/sites, fuel policy, insurance type, daily kilometer allowance, excess-kilometer fee, protection packages, promotions, and busy periods.
- Open the calendar icon to select a protected date range. Reserved and maintenance dates are visibly unavailable and cannot be selected.
- Receive a shorter available-period suggestion when the requested duration would collide with the next reservation or its protected turnaround window.
- Select one of the vehicle’s company-approved pickup cities and exact pickup sites.
- Choose an independent return city and return site, or keep **Return at the same site as pickup** checked so the booking form synchronizes both locations automatically.
- Review the latest system-recorded vehicle odometer and optionally acknowledge it in the rental contract.
- Choose Basic, Pro, Premium, or Full company protection packages that are assigned to the selected vehicle.
- Add rental-period services such as a one-day driver, luggage loading/offloading labor, child seat, and in-car Wi-Fi. Renters may adjust service days only.
- Apply eligible promotion codes and see the complete proposal total before booking.
- Track bookings through `pending → active → completed`, or cancel eligible pending/active rentals.
- Message the correct rental company from a rental-linked support conversation and receive in-app replies and notifications.

### Authentication and account access

- Email/password authentication supports renter and company accounts with signed JWT sessions.
- Renters can continue with Google or Facebook through OAuth 2.0 authorization-code callbacks.
- Passwordless phone authentication sends a cryptographically generated six-digit, expiring verification code through the WhatsApp Cloud API.
- Phone codes are bcrypt-hashed at rest, one-use, attempt-limited, and request-rate-limited. Phone numbers are normalized to international E.164 form and unique per account.
- Local PGlite development exposes the generated demo code only when WhatsApp credentials and an external `DATABASE_URL` are both absent; configured production databases never expose codes in API responses.
- Authentication return paths accept only same-origin relative destinations, preventing external redirect injection while preserving the renter’s intended booking.
- Guest marketplace responses expose only customer-facing fields. Fleet identifiers and operational data such as VINs, license plates, odometers, fuel levels, insurance policy numbers, and internal promotion metadata remain private.

#### Guest-to-booking flow

1. A visitor opens `/browse` and can search, filter, sort, and inspect available cars without a session.
2. `/browse/[id]` shows customer-safe vehicle details, pickup locations, rates, promotions, protection packages, and blocked periods.
3. Selecting **Rent now** sends an unauthenticated visitor to `/login` with a validated relative return destination.
4. The visitor signs in with email/password, Google, Facebook, or a WhatsApp verification code.
5. FleetFlow returns the renter to `/dashboard/browse/[id]?rent=1` and opens the protected booking interface automatically.
6. Rental creation remains authenticated and renter-only; direct guest requests to the rentals API are rejected.

### Company fleet management

- Create, edit, view, retire, and—when history permits—delete vehicles.
- Store make, model, trim, year, body type, transmission, drivetrain, steering type, fuel, seats, color, plate, VIN, features, image, and status.
- Configure independent hourly, daily, weekly, and monthly rates for each vehicle.
- Configure each vehicle’s own:
  - Daily allowed kilometers
  - Excess fee per kilometer
  - Fuel policy and current fuel level
  - Current canonical odometer
  - Multiple pickup cities and exact pickup sites
  - Issued insurance coverage, provider, policy number, expiry, and deductible
- View vehicle lifetime revenue, completed trips, active bookings, rental history, protection assignments, pickup network, telemetry, and efficiency analysis.
- Search fleet records using vehicle IDs, plates, VINs, locations, policy data, odometers, rates, and other operational fields.

### Mileage policies, money control, and odometer billing

- Company administrators manage reusable mileage policies from `/dashboard/policies`.
- Every policy defines a name, description, daily kilometer allowance, fee per excess kilometer, active/paused state, and vehicle scope.
- A company may keep one whole-fleet default policy and create selected-vehicle policies for specific groups. Selected policies override the fleet default, and a vehicle cannot belong to two selected policies.
- Saving or enabling a policy synchronizes its allowance and excess rate to the applicable current vehicles. New vehicles automatically inherit the active whole-fleet default unless they later receive a selected policy.
- New rentals snapshot the effective policy ID, name, daily allowance, total rental allowance, and excess rate. Editing, pausing, or deleting a policy never rewrites an existing rental contract.
- The return form refreshes the latest system odometer and previews in real time:
  - Verified distance traveled
  - Excess kilometers above the snapshotted allowance
  - The exact excess-distance charge that will be added to the final bill
- Completion updates the canonical vehicle odometer and fuel state atomically, records a condition-history event, calculates the excess charge on the server, and adds it to the invoice total.
- Mileage policies are included in company global search by name, description, allowance, fee, status, and scope.

### Availability and reservation integrity

- Every pair of adjacent blocking reservations preserves at least a **one-hour vehicle turnaround** for inspection, cleaning, maintenance, and fueling.
- Application-level conflict checks provide renter-friendly availability messages and shorter-period suggestions.
- Reservation creation locks the selected vehicle and repeats conflict checks inside the transaction, closing concurrent-booking races.
- A PostgreSQL `btree_gist` exclusion constraint supplies a final database-level no-overlap guard.
- Scheduled and in-progress maintenance windows are included in availability and receive the same protected operational buffer.
- Insurance expiry is checked against the requested return time.

### Pickup, return, odometer, and kilometer charging

- A rental snapshots the latest system odometer at booking time.
- Renter odometer acknowledgment and its timestamp are stored independently and optionally.
- Before pickup or return, company staff receive refreshed vehicle telemetry rather than a stale page value.
- Pickup and return require staff confirmation of the latest reading.
- Pickup and return odometers and fuel levels are recorded atomically with the vehicle’s current state and condition history.
- Return completion requires the latest return odometer.
- Distance traveled is calculated from pickup and return readings.
- The rental snapshots the vehicle’s daily allowance and excess rate, so later fleet-policy changes never rewrite an existing contract.
- Total allowance is calculated from rental duration × snapshotted daily allowance.
- Excess distance is charged as:

```text
max(0, return odometer − pickup odometer − total allowed kilometers)
× snapshotted excess fee per kilometer
```

### Fueling and vehicle-efficiency analytics

- The add-fuel form refreshes, displays, and prefills the last system-recorded odometer.
- Refueling entries require odometer, fuel level, liters added, and total fuel cost.
- Manual, pickup, return, and refueling readings are retained as auditable condition-history events.
- FleetFlow derives for each valid refueling interval:
  - Distance since the previous refuel
  - Fuel spend per kilometer
  - Liters per 100 km
- Per-vehicle analytics aggregate measured distance, liters, fuel cost, cost/km, and L/100 km.
- Advisory—not automatic—fleet recommendations classify vehicles as:
  - Insufficient data
  - Efficient / retain in service
  - Monitor
  - Withdrawal review
- Historical vehicle and condition-log readings are reconciled into a canonical odometer that cannot move backward.

### Insurance and renter protection

- Companies manage insurance/protection packages from a dedicated dashboard page.
- Each company may create multiple Basic, Pro, Premium, and Full packages.
- Packages contain a name, description, daily price, deductible, included coverage, active state, and assignment scope.
- Coverage catalogs can disclose Saudi-market items such as TPL, CDW, LDW, SCDW, theft protection, personal accident cover, roadside assistance, and glass/tyre protection.
- A package can apply to the whole fleet or only selected vehicles, allowing different packages for different vehicle groups.
- Vehicle-issued insurance remains distinct from renter-period protection and is shown separately on the bill.
- Eligible protection details are copied into immutable rental snapshots, including name, tier, price, days, subtotal, deductible, and coverage.
- Historical rentals retain their original package terms even if the company later edits or removes a catalog package.

### Platform administration, company verification, and subscriptions

- FleetFlow has a separate `platform_admin` role and maintainable administration workspace. Its four destinations are direct, independently visible main-sidebar entries rather than tabs inside one combined screen.

| Administration page | Route | Responsibility |
| --- | --- | --- |
| Verification Requests | `/dashboard/admin/verifications` | Review legal documents and subscription-payment references, then approve or reject company applications |
| Companies | `/dashboard/admin/companies` | Manage verified-company lifecycle, package assignment, usage, and per-company limit overrides |
| Subscriptions | `/dashboard/admin/subscriptions` | Add, activate, deactivate, and edit subscription-package pricing and limits |
| Payments | `/dashboard/admin/payments` | Add/edit Kuraimi transfer accounts, configure the automatic-payment adapter, and review payment history |

- Platform-administrator login opens Verification Requests directly. Every page and supporting API requires the `platform_admin` role.
- The Companies page lists verified companies, supports active/paused/deactivated operational states, package assignment, and per-company vehicle, monthly request, and storage overrides. Blank overrides inherit the selected package defaults.
- Pausing removes a company from the public marketplace and blocks new requests while preserving back-office access for existing operations. Deactivation additionally blocks company operational APIs until a platform administrator reactivates it.
- A newly registered company starts as `unsubmitted` and cannot use company operations, publish marketplace inventory, or receive new rental requests until a platform administrator approves it.
- A verification application requires the business registration, tax certificate, owner ID/passport, an active subscription package, and the subscription-fee transfer/payment reference code. PDF, JPG, PNG, and WebP files are accepted up to 5 MB each.
- Only one application may be pending. Approved companies cannot submit again; rejected companies receive review notes and may submit a corrected new attempt.
- The Subscriptions page includes an explicit **Add subscription package** action. Its responsive modal collects a unique normalized package code, name, description, monthly USD price, active state, vehicle limit, monthly rental-request limit, and storage allowance. Duplicate codes and invalid limits are rejected server-side; newly active packages become available to company verification applications immediately.
- Existing package cards remain editable and can be activated or deactivated without changing historical verification/payment references. The initial recommendations are Starter ($29/month: 10 vehicles, 120 rental requests/month, 5 GB), Growth ($89/month: 50 vehicles, 1,000 requests/month, 25 GB), and Scale ($249/month: 250 vehicles, 10,000 requests/month, 100 GB).
- Vehicle and monthly rental-request limits are enforced server-side. Storage is recorded as a package entitlement for uploaded platform assets as those storage-backed features are expanded.
- The Payments page includes an explicit **Add bank account** action with a padded, responsive modal for account number, account holder, optional transfer instructions, and immediate publication state. Administrators can configure only an unused predefined Al Kuraimi channel: SAR, USD, YER (new), or YER (old).
- Configured bank-account channels are edited in place and cannot be added twice. Inactive or incomplete accounts remain hidden from companies, while published accounts are available for subscription-fee transfers.
- The Kuraimi automatic-payment adapter, idempotent payment records, protected callback, and admin configuration are implemented but disabled until bank credentials and endpoint details are provided. Keep secrets in server environment variables, never in browser or database settings:

```env
PLATFORM_ADMIN_EMAIL=admin@fleetflow.com
PLATFORM_ADMIN_PASSWORD=replace-with-a-strong-password
KURAIMI_API_KEY=provided-by-kuraimi
KURAIMI_WEBHOOK_SECRET=provided-or-generated-for-callback-signing
```

- The Kuraimi API base URL, merchant ID, and create-payment path are editable by the platform administrator. Confirm the final field names, authentication headers, callback signature, and endpoint paths against Kuraimi’s official merchant API documentation before enabling production payments.

### Company-controlled loyalty programs

- Each rental company independently chooses whether its loyalty program is active or paused. A paused program grants no loyalty discount or points on new bookings.
- Participating companies configure the points earned per final paid currency unit and manage four default levels: Bronze, Silver, Gold, and Platinum.
- Company administrators can rename every level and adjust its point threshold and automatic vehicle-rental discount. Thresholds must be ordered, and the first level begins at zero points.
- Loyalty is isolated per company: a renter’s points and level with one company never affect another company.
- The booking proposal shows the renter’s current company-specific level, points, progress to the next level, automatic discount, and estimated points before confirmation.
- The server applies the current level discount automatically alongside eligible promotions, while ensuring combined vehicle discounts never exceed the vehicle subtotal.
- New rentals snapshot the granted level, discount percentage, discount value, and earning rate. Later program edits affect status and future bookings without rewriting an existing quotation or invoice.
- Points are awarded once, only after return inspection and payment produce the final Paid waybill. The final paid total determines the whole-number points written to the auditable loyalty ledger.
- Renters see active memberships, company-specific progress, level discounts, and points on their dashboard. Loyalty discounts and earned points also appear on rental invoices.

### Premium services, promotions, and bill adjustments

- Companies can create and pause premium daily services and control catalog prices.
- Company administrators may adjust service days, per-day prices, per-service discounts, and an additional bill-wide discount on an individual rental.
- Renters can change only the number of selected service days.
- Promotions support fixed or percentage discounts, date windows, minimum quantities, all-fleet or selected-vehicle targeting, redemption counts, and live/scheduled/expired/paused states.
- Updated billing is issued immediately to the renter and generates a notification.

### Rental bill, proposal, PDF, and printing

- Commercial-document status is tracked independently from operational rental status: booking creates a **Quotation** proposal, signed pickup creates an **Issued** sales invoice, and verified return creates the final **Paid** waybill. These badges appear alongside—not instead of—Pending, Active, Completed, or Cancelled.
- Company confirmation accepts the request without recording pickup readings. The renter immediately sees **Request confirmed** and receives a Pickup action in Rentals.
- At the pickup site, the renter opens that action, checks the exact vehicle ODO and fuel level, types their full-name signature, and accepts the handover agreement. The signed receipt acknowledges the pickup ODO and issues the sales invoice without a second odometer checkbox. If the renter cannot complete it, authorized company staff can use the Handover action to record the same evidence on the renter’s behalf.
- Pickup/Handover is a one-time action. It disappears immediately for both renter and company after either authorized party records the pickup; open Rentals pages synchronize this state automatically. The issued invoice remains the permanent pickup record.
- At return, company staff enter the actual odometer and fuel level. FleetFlow recalculates traveled distance, allowed and excess kilometers, fuel charges, and the final total to two-decimal currency precision. Staff must confirm settlement before completion locks the immutable final waybill and marks it Paid.
- The online bill and its PDF/print versions include:
  - Issuer and renter details
  - Vehicle, plate, transmission, fuel, and issued-insurance information
  - Booking, pickup, and return odometers
  - Pickup and return fuel levels
  - Pickup city/site and return city/site
  - Rental dates and rate plan
  - Vehicle rental, protection, services, promotions, discounts, fuel charge, and excess-distance charge
  - Allowed kilometers per day
  - Total allowed kilometers for the rental
  - Fee charged for every excess kilometer
  - QR code linking to the same secured online bill
- The QR area shares the page with the totals instead of creating unused document space.
- Account authorization or an unguessable invoice share token protects bill access.
- Bills can be opened, downloaded, printed, prepared for email, or shared through WhatsApp/native file sharing.
- Browser printing uses a dedicated named **A4 portrait** page, waits for fonts/images/QR assets, and dynamically scales the full document to exactly one organized page.
- The printed bill preserves the required two-column × two-row schedule, desktop vehicle layout, pricing table, QR/totals row, and footer even when printing from a narrow screen.
- Reporting uses a separate named A4 landscape page, so report print rules cannot change rental-bill orientation.
- English and Arabic invoice PDFs are generated as one portrait A4 page.

### Maintenance operations

- Maintain a reusable preventive-maintenance catalog for oil, filters, batteries, brakes, tires, fluids, transmissions, ignition, A/C, inspections, and custom work.
- Schedule workshop windows with due dates, odometer thresholds, duration, recurrence, priority, vendor, cost, and notes.
- Detect reservation and service-due risks before a vehicle is handed over.
- Start, complete, cancel, or reschedule work orders.
- Completing recurring maintenance can create the next service occurrence automatically.
- Attach and securely download PDF/image workshop waybills up to 5 MB.
- Use responsive table and grid views for maintenance schedule and service history without forced horizontal scrolling.

### Operational reporting

- Companies generate complete performance, rental-history, vehicle-detail, and customer-detail reports with authorized date, vehicle, and customer filters.
- Renters receive one focused personal rental dashboard with only `Period from` and `Period to`; changing either date refreshes the dashboard automatically.
- The renter dashboard summarizes trips, spending, distance, rental status, monthly activity, and recent rentals on one printable A4 landscape page. Renters can print it or export it as PDF; operational report types and Excel export remain company-only.
- Preview every generated company report or renter dashboard directly below its controls.
- Reports include, where applicable:
  - Rental and customer performance
  - Revenue, maintenance cost, fuel cost, total cost, profit, and margin
  - Profitability per company and vehicle
  - Maintenance history
  - Fueling history with refuel distance, cost/km, and L/100 km
  - Odometer and usage history
  - Pickup/return cities and sites
  - Daily/total kilometer allowances and excess rates
- Company reports export as professional multi-page **A4 landscape PDFs** with embedded Arabic-capable fonts; renter dashboard PDFs remain a focused single page.
- Companies can export dependency-free Excel 2003 SpreadsheetML workbooks with separate summary, rental, vehicle, customer, maintenance, fueling, and odometer worksheets.

### Search, support, notifications, and settings

- Keyboard-accessible global search (`⌘/Ctrl + K`) is role-isolated and searches relevant IDs/codes, vehicles, VINs, plates, locations, bookings, customers, maintenance, insurance, promotions, services, support, dates, odometers, and monetary amounts.
- Support tickets include category, priority, rental/company routing, persistent messages, unread state, automated delivery acknowledgments, and resolved/reopened workflows.
- Notifications cover renter messages, company replies, new rental requests, lifecycle changes, billing updates, unread counts, direct links, polling, and mark-read controls.
- Settings manage renter/company profiles, company workspace identity, notification channels/topics, language, theme, and secure password changes.

### Arabic, RTL, themes, typography, and responsive UI

- English and Arabic are available throughout the marketplace, dashboard, booking flow, documents, reporting, support, and settings.
- Arabic switches the complete interface to RTL and uses self-hosted **Readex Pro** with `sans-serif` fallback.
- Server-rendered `lang`/`dir`, persisted cookies, and account preferences prevent language/layout mismatch.
- Light/dark toggles switch directly and persist to local storage, cookies, and signed-in preferences.
- A centralized responsive typography scale keeps controls, tables, cards, dashboards, invoices, and reports readable on phones and large screens.
- Mobile controls use touch-friendly sizing and 16px form text where needed to prevent browser zoom.
- The dashboard includes a professional collapsible sidebar, responsive top bar, grid/table preferences, skeletons, empty states, modals, toasts, and optimistic updates with rollback.

## Immutable rental snapshots

FleetFlow deliberately copies contract-sensitive values into each rental. Existing rentals remain historically accurate if a company later changes a vehicle or catalog entry.

| Snapshot | Purpose |
| --- | --- |
| Booking odometer | Exact system reading presented when the booking was created |
| Renter acknowledgment + timestamp | Optional evidence that the renter reviewed the booking reading |
| Pickup/return city and site | Preserves both agreed handover locations |
| Mileage policy ID/name | Identifies the reusable company policy selected at booking |
| Daily and total kilometer allowance | Protects the contract from later policy changes |
| Excess fee per kilometer | Keeps excess-distance billing reproducible |
| Protection package fields | Preserves tier, coverage, prices, deductible, days, and subtotal |
| Premium service lines | Preserves names, prices, days, discounts, and totals |
| Pickup/return odometers and fuel | Supports auditable distance, fuel, and return calculations |

## Demo data and accounts

All seeded accounts use the password **`demo1234`**.

| Role | Email | Entity |
| --- | --- | --- |
| Renter | `alex@demo.com` | Alex Morgan |
| Renter | `sara@demo.com` | Sara Lee |
| Renter | `maya@demo.com` | Maya Chen |
| Renter | `james@demo.com` | James Wilson |
| Company | `citydrive@demo.com` | CityDrive Rentals |
| Company | `luxwheels@demo.com` | LuxWheels Premium |
| Company | `ecomotion@demo.com` | EcoMotion EV |
| Platform administrator | `admin@fleetflow.com` | FleetFlow Platform Admin |

The seed includes 17 vehicles, multiple pickup cities/sites per vehicle, whole-fleet and selected-vehicle mileage policies, four protection tiers per company, premium services, promotions across lifecycle states, rental histories, realistic multi-interval refueling data, odometer/condition logs, maintenance work, notifications, and a company-routed support conversation.

## Technology stack

- **Framework:** Next.js 16 App Router and React 19
- **Language:** TypeScript
- **Database:** PostgreSQL or persistent local PGlite
- **ORM/schema:** Drizzle ORM and Drizzle Kit
- **Authentication:** `jose` JWT sessions, `bcryptjs` password/OTP hashing, Google/Facebook OAuth, and WhatsApp Cloud API
- **UI:** Tailwind CSS v4 foundation plus a custom responsive design system
- **Icons:** Lucide React
- **Documents:** PDF-Lib, Fontkit, jsPDF, and html2canvas
- **Arabic PDF support:** self-hosted Readex Pro, Arabic reshaping, and bidi reordering
- **QR codes:** `qrcode`
- **Spreadsheet export:** Excel 2003 SpreadsheetML without an XLSX dependency
- **Local seed runner:** `tsx`

## Getting started

```bash
npm install

# Optional: configure PostgreSQL, a strong session secret, and sign-in providers
cp .env.example .env
# Edit DATABASE_URL, JWT_SECRET, APP_URL, and the provider credentials in .env

npm run db:seed
npm run dev
```

Open `http://localhost:3000`.

When `DATABASE_URL` is omitted, FleetFlow automatically starts a persistent PGlite database under `data/`, applies its local PostgreSQL-compatible DDL, and seeds demo data on first use. Production PostgreSQL initialization also creates the `btree_gist` extension and protected no-overlap rental constraint.

### External sign-in configuration

Set `APP_URL` to the exact public origin and register these callbacks with each provider:

- Google: `${APP_URL}/api/auth/oauth/google/callback`
- Facebook: `${APP_URL}/api/auth/oauth/facebook/callback`

| Variable | Required for | Description |
| --- | --- | --- |
| `APP_URL` | OAuth | Exact public application origin, without a trailing slash |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google | OAuth 2.0 web-application credentials |
| `FACEBOOK_APP_ID` / `FACEBOOK_APP_SECRET` | Facebook | Facebook Login application credentials |
| `FACEBOOK_GRAPH_VERSION` | Facebook | Graph API version; defaults to `v21.0` |
| `WHATSAPP_ACCESS_TOKEN` | WhatsApp | Meta WhatsApp Cloud API access token |
| `WHATSAPP_PHONE_NUMBER_ID` | WhatsApp | Sending phone-number ID, not the visible phone number |
| `WHATSAPP_GRAPH_VERSION` | WhatsApp | Graph API version; defaults to `v21.0` |
| `WHATSAPP_TEMPLATE_NAME` | Optional WhatsApp template | Approved authentication template whose first body parameter receives the code |
| `WHATSAPP_TEMPLATE_LANGUAGE` | Optional WhatsApp template | Approved template locale, such as `en_US` |
| `OTP_TTL_SECONDS` | Phone authentication | Code lifetime; defaults to 300 seconds |
| `OTP_RATE_LIMIT_SECONDS` | Phone authentication | Minimum delay between code requests for a phone number |
| `OTP_MAX_ATTEMPTS` | Phone authentication | Maximum verification attempts before a code is rejected |
| `PLATFORM_SUPPORT_EMAIL` | Public support | Management recipient included in optional webhook payloads; defaults to `support@fleetflow.app` |
| `PUBLIC_SUPPORT_HASH_SECRET` | Public support (optional) | Dedicated HMAC key for pseudonymous source rate-limit identifiers; falls back to `JWT_SECRET` |
| `PLATFORM_SUPPORT_WEBHOOK_URL` | Public support (optional) | HTTPS management-workflow endpoint that receives each successfully stored public request |
| `PLATFORM_SUPPORT_WEBHOOK_SECRET` | Public support webhook (recommended) | HMAC key used to sign the raw JSON payload as `X-FleetFlow-Signature: sha256=<hex>` |

Public support is durable independently of the webhook: `POST /api/public-support` stores the validated request first and returns `201` with its reference. An optional webhook is attempted with a five-second timeout; non-success responses or delivery failures are logged without deleting the request or turning the accepted submission into an error. The receiver should calculate HMAC-SHA256 over the raw request body, compare it to `X-FleetFlow-Signature` using a timing-safe comparison, and reject stale or duplicate references according to its own policy. Do not expose the webhook URL or secret to browser code.

In local PGlite development, if WhatsApp credentials are absent, the request endpoint returns a clearly labeled demo code for testing. When `DATABASE_URL` is configured, missing WhatsApp credentials produce an error instead of exposing the code. See `.env.example` for the complete template.

For production:

```bash
npm run build
npm start
```

## Project structure

```text
src/
├── app/
│   ├── page.tsx                         # Public marketplace landing page
│   ├── privacy|terms/                   # Bilingual public legal information
│   ├── support/                         # Guest FAQs and platform-management contact
│   ├── login|register/                  # Email, OAuth, WhatsApp, and demo access
│   ├── browse/                          # Guest marketplace and vehicle details
│   ├── invoice/[id]/                    # Online/print rental document
│   ├── dashboard/
│   │   ├── page.tsx                     # Role-aware overview
│   │   ├── admin/                       # Platform-admin-only workspace
│   │   │   ├── verifications/           # Company application review
│   │   │   ├── companies/               # Lifecycle, packages, usage, overrides
│   │   │   ├── subscriptions/           # Subscription-package creation/editing
│   │   │   └── payments/                # Bank accounts, gateway, payment history
│   │   ├── browse/                      # Marketplace, details, city filters, booking
│   │   ├── vehicles/                    # Fleet CRUD, pickup networks, telemetry
│   │   ├── rentals/                     # Lifecycle, handover, return, billing
│   │   ├── policies/                    # Fleet/selected-vehicle mileage policies
│   │   ├── insurance/                   # Protection-package catalog and assignment
│   │   ├── maintenance/                 # Scheduling, recurring work, waybills
│   │   ├── reports/                     # Filters and A4 landscape preview
│   │   ├── promotions/                  # Promotion targeting and lifecycle
│   │   ├── services/                    # Premium-service catalog
│   │   ├── support/                     # Routed support conversations
│   │   └── settings/                    # Profiles, preferences, security
│   └── api/                             # Role-isolated JSON/document endpoints
├── components/                          # Booking, public chrome, shell, search, shared UI
├── db/                                  # Drizzle schema, DDL/bootstrap, realistic seed
├── lib/
│   ├── public-content.ts                # Bilingual public FAQs and market policies
│   ├── availability.ts                  # Turnaround/conflict calculations
│   ├── insurance.ts                     # Protection normalization
│   ├── invoice.ts                       # Authorized invoice data and server PDF
│   ├── locations.ts                     # Multi-city pickup normalization/validation
│   ├── maintenance.ts                   # Maintenance conflict/recurrence logic
│   ├── kilometer-policy.ts              # Scope validation and policy synchronization
│   ├── oauth.ts                         # Google/Facebook authorization-code helpers
│   ├── phone-auth.ts                    # E.164 normalization and WhatsApp delivery
│   ├── public-vehicle.ts                # Guest-safe marketplace projections
│   ├── reports.ts                       # Authorized report aggregation
│   ├── report-export.ts                 # PDF and SpreadsheetML exports
│   └── telemetry.ts                     # Canonical odometer and fuel analytics
└── public/                               # Vehicle images and self-hosted fonts
```

## API overview

| Endpoint | Access | Purpose |
| --- | --- | --- |
| `POST /api/auth/register` · `login` · `logout` | Public/signed in | Email/password account and session management |
| `GET /api/auth/oauth/[provider]` · `callback` | Public | Google/Facebook authorization and account sign-in |
| `POST /api/auth/phone/request` · `verify` | Public | WhatsApp verification-code request and passwordless sign-in |
| `GET /api/auth/me` | Signed in | Current role and profile |
| `GET /api/landing` | Public | Landing-page vehicles, companies, and promotions |
| `POST /api/public-support` | Public | Validate, rate-limit, persist, and optionally forward platform-management requests |
| `GET /api/dashboard` | Signed in | Role-aware dashboard metrics |
| `GET /api/search` | Signed in | Ranked, role-isolated global operational search |
| `GET/PATCH /api/admin/verifications` | Platform administrator | List, approve, or reject company verification applications |
| `GET/PATCH /api/admin/companies` | Platform administrator | List verified companies and manage lifecycle, package, and limit overrides |
| `GET/POST/PATCH /api/admin/subscription-plans` | Platform administrator | List, create, activate/deactivate, and edit subscription packages |
| `GET/POST/PATCH /api/admin/bank-accounts` | Platform administrator | List, configure, publish, and edit predefined Kuraimi transfer channels |
| `GET/PATCH /api/admin/payment-settings` | Platform administrator | Read or configure the Kuraimi automatic-payment adapter without exposing secrets |
| `GET /api/admin/payments` | Platform administrator | Review subscription-payment history and provider references |
| `GET/POST /api/vehicles` | Public/company | Available marketplace inventory / company vehicle creation |
| `GET/PATCH/DELETE /api/vehicles/[id]` | Public/company | Available vehicle details / company editing and deletion |
| `GET /api/vehicles/[id]/availability` | Public | Busy periods, protected turnaround, and suggestions |
| `GET/POST /api/vehicles/[id]/telemetry` | Company | Current readings, logs, fueling, and efficiency analytics |
| `GET/POST /api/kilometer-policies` | Company | List or create whole-fleet/selected-vehicle mileage policies |
| `PATCH/DELETE /api/kilometer-policies/[id]` | Company | Apply, pause, reassign, update, or delete a mileage policy |
| `GET/POST /api/rentals` | Signed in/renter create | Rental history and overlap-safe booking |
| `PATCH /api/rentals/[id]` | Rental participant/company | Confirm, complete, cancel, return, or adjust billing |
| `GET /api/rentals/[id]/invoice` | Account/share token | Authorized online invoice data |
| `GET /api/rentals/[id]/invoice/pdf` | Account/share token | One-page portrait A4 PDF |
| `GET/POST /api/insurance-packages` | Company | List and create protection packages |
| `PATCH/DELETE /api/insurance-packages/[id]` | Company | Edit, assign, pause, or delete a package |
| `GET/POST /api/services` | Authorized/company create | Premium-service catalog |
| `PATCH/DELETE /api/services/[id]` | Company | Update or remove a premium service |
| `GET/POST /api/promotions` | Company | List and create promotions |
| `PATCH/DELETE /api/promotions/[id]` | Company | Edit, toggle, or delete promotions |
| `GET /api/promotions/validate` | Signed in | Validate vehicle eligibility and discount |
| `GET/POST /api/maintenance` | Company | Dashboard data and work-order creation |
| `PATCH /api/maintenance/[id]` | Company | Reschedule, start, complete, cancel, or attach waybill |
| `GET /api/maintenance/[id]/waybill` | Company | Secure workshop-waybill download |
| `POST /api/maintenance/items` | Company | Add reusable maintenance items |
| `PATCH /api/maintenance/items/[id]` | Company | Update reusable maintenance items |
| `GET /api/reports` | Signed in | Authorized report preview data and filter options |
| `GET /api/reports/export` | Signed in | A4 landscape PDF for all roles; SpreadsheetML export for companies only |
| `GET/POST /api/support` | Signed in | List or create routed conversations |
| `GET/POST/PATCH /api/support/[id]` | Participants | Read, reply, resolve, or reopen a conversation |
| `GET/PATCH /api/notifications` | Signed in | Notification inbox and read state |
| `GET/PATCH /api/settings` | Signed in | Profile, workspace, preferences, and password |
| `GET /api/health` | Public | Application/database health |

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the development server on `0.0.0.0` |
| `npm run build` | Create an optimized production build |
| `npm start` | Serve the production build on `0.0.0.0` |
| `npm run typecheck` | Run strict TypeScript checking without output |
| `npm run db:push` | Push the Drizzle schema to configured PostgreSQL |
| `npm run db:seed` | Reset and seed realistic demo operational data |

## Validation baseline

The repository is expected to pass:

```bash
npm run typecheck
npm run build
npm audit --omit=dev
git diff --check
```

Functional checks should confirm:

- Public routes: `/`, `/privacy`, `/terms`, and `/support` render in English/Arabic, RTL, light/dark, mobile, and print contexts; every public header/footer link resolves.
- Support separation: guests can use public FAQs and the management form but cannot open the authenticated rental-support workspace; rental issues are visibly routed to `/dashboard/support` after sign-in.
- Public form: validation failures return `400`, accepted requests persist with a unique `FF-WEB-######` reference and return `201`, the fourth request in a rolling 15-minute source window returns `429`, and an unavailable webhook does not lose or reject an already stored request.
- Guest marketplace: `/browse`, vehicle details, and availability load without a session while private fleet fields remain absent from responses.
- Rent gate: guest rental creation receives `401`; **Rent now** preserves the intended vehicle through sign-in and opens booking afterward.
- Platform administration: the four direct sidebar destinations load for a platform administrator, while unauthenticated and non-admin requests cannot use their management APIs.
- Subscription packages: a valid unique package can be created and immediately edited; active packages appear in company verification, while duplicate codes and invalid limits are rejected.
- Bank accounts: only the four predefined Kuraimi channels can be configured, configured channels reject duplicate creation, and only complete published accounts are visible to companies.
- Phone sign-in: incorrect codes fail, the valid code creates a renter session, and consumed codes cannot be reused.
- OAuth: configured provider callbacks exactly match `APP_URL`, reject invalid state, and preserve only validated relative return paths.
- Rental invoice/PDF: exactly one A4 portrait page in English and Arabic.
- Browser print: named portrait A4 page with no report-orientation leakage or blank second page.
- Operational report PDF: all pages A4 landscape.
- Spreadsheet export: opens as a multi-worksheet `.xls` workbook.
