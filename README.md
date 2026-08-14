# FleetFlow — Car Rental Platform

FleetFlow is a full-stack car rental marketplace where **rental companies** list and manage their fleets, and **renters** book vehicles by the **hour, day, week, or month**. It includes live promotions, a complete rental-status pipeline, and rental history for both users and vehicles.

Built with **Next.js 16 (App Router)**, **PostgreSQL**, and **Drizzle ORM**, with a polished responsive interface, light and dark themes, and English/Arabic RTL localization.

## Platform capabilities

### For renters

- Search and filter the marketplace by category and gearbox, sort by price/year, and switch displayed prices between hourly, daily, weekly, and monthly rates.
- Select a rate type, quantity, and pickup time and see the calculated return time and live price breakdown before confirming.
- Apply company promo codes with instant server validation and a discount preview.
- Add premium daily services—professional driver, luggage loading/offloading, child seat, and in-car Wi-Fi—and choose only the number of service days.
- Review a detailed rental proposal covering vehicle charges, service lines, and discounts before confirming.
- Track every booking through `pending → active → completed` or `cancelled`.
- View complete rental history with dates, companies, discounts, services, and totals.
- Open, download, print, email, or share the PDF proposal/invoice through WhatsApp from the rental account.
- Cancel pending or active rentals from the dashboard.
- See vehicle busy periods before choosing a booking window.

### For rental companies

- Full fleet CRUD with photos, specifications, features, odometer data, and four independent rate tiers.
- Mark vehicles `available`, `maintenance`, or `retired`.
- Confirm pending rental requests, complete active rentals, and cancel reservations with optimistic UI updates and rollback.
- Create percentage or fixed discounts for the entire fleet or hand-picked vehicles.
- Configure promotion windows, minimum quantities, and enable/pause controls. Live, scheduled, expired, and paused states are computed automatically.
- Review per-vehicle lifetime revenue, trip counts, current bookings, and complete rental history.
- Configure the premium-service catalog and per-day pricing, pause services, or add custom services.
- Adjust service days, service price/day, per-service discounts, and an additional bill-wide discount for an individual rental.
- Issue updated PDF proposals/invoices that are immediately visible in the renter account and shareable through native email/WhatsApp file sharing.
- Monitor fleet size, pending requests, active rentals, monthly revenue, six-month trends, and utilization from the company overview.

### Platform-wide

- Email/password authentication with bcrypt password hashing and `jose` JWT sessions stored in secure httpOnly cookies.
- Role-aware renter and company workspaces.
- Three-layer double-booking protection: application overlap checks, a PostgreSQL `rentals_no_overlap` exclusion constraint, and visible busy periods in the booking experience.
- A mandatory **one-hour turnaround window** follows every blocking reservation so companies have protected time for inspection, cleaning, maintenance, and fueling.
- The booking calendar disables reserved dates, highlights turnaround boundaries, and shows the exact maximum available window before the next reservation. Oversized requests return a structured availability suggestion instead of being accepted.
- Light, dark, and system themes using `next-themes`, persisted across pages without a flash of the wrong theme.
- English and Arabic localization with server-rendered `<html lang>`/`dir`, a persisted `ff_lang` cookie, full RTL layout, and localized dashboard/auth/marketplace experiences.
- Skeleton loading, empty states, responsive dialogs, confirmation prompts, toasts, optimistic status updates, and mobile navigation.

## Demo accounts

All seeded accounts use the password **`demo1234`**.

| Role | Email | Entity |
| --- | --- | --- |
| Renter | `alex@demo.com` | Alex Morgan |
| Renter | `sara@demo.com` | Sara Lee |
| Company | `citydrive@demo.com` | CityDrive Rentals |
| Company | `luxwheels@demo.com` | LuxWheels Premium |
| Company | `ecomotion@demo.com` | EcoMotion EV |

The seed includes **17 vehicles**, **7 promotions** across every lifecycle state, and rentals across pending, active, completed, and cancelled statuses. Demo-account chips on the login page autofill credentials.

## Tech stack

- **Framework:** Next.js 16 App Router and React 19
- **Database:** PostgreSQL with Drizzle ORM
- **Local preview fallback:** PGlite, a persistent embedded PostgreSQL runtime, when `DATABASE_URL` is not set
- **Authentication:** `jose` JWT sessions and `bcryptjs`
- **Styling:** Tailwind CSS v4 plus a custom class-based dark variant and design system
- **Theming:** `next-themes`
- **Icons:** `lucide-react`
- **Charts:** Recharts
- **PDF billing:** `pdf-lib` with secure account/share-token delivery
- **Seeding:** TypeScript through `tsx`

## Getting started

```bash
npm install

# Production PostgreSQL
cp .env.example .env
# Set DATABASE_URL and JWT_SECRET in .env
npx drizzle-kit push

# Recommended database-level overlap guard
psql "$DATABASE_URL" -c "CREATE EXTENSION IF NOT EXISTS btree_gist;"
psql "$DATABASE_URL" -c "ALTER TABLE rentals ADD CONSTRAINT rentals_no_overlap \
  EXCLUDE USING gist (vehicle_id WITH =, \
    tstzrange(starts_at, ends_at + interval '1 hour', '[)') WITH &&) \
  WHERE (status IN ('pending','active'));"

npm run db:seed
npm run dev
```

Open `http://localhost:3000`.

When `DATABASE_URL` is omitted, FleetFlow automatically boots a persistent local PGlite database under `data/` and seeds it on first run. This makes the full application immediately previewable without reducing the production PostgreSQL/Drizzle path.

## Project structure

```text
src/
├── app/
│   ├── page.tsx                     # Marketplace landing page
│   ├── login|register/              # Split-screen authentication and demo autofill
│   ├── dashboard/
│   │   ├── page.tsx                 # Role-aware company/renter overview
│   │   ├── vehicles/                # Fleet CRUD and per-vehicle history/analytics
│   │   ├── rentals/                 # Role-aware rental pipeline and history
│   │   ├── promotions/              # Promotion CRUD, targeting, and lifecycle
│   │   ├── services/                # Premium-service catalog and daily pricing
│   │   └── browse/                  # Marketplace, vehicle details, and booking
│   ├── invoice/[id]/                # Printable, downloadable, and shareable bill
│   └── api/
│       ├── auth/                    # Register, login, logout, current session
│       ├── vehicles/                # Fleet CRUD and vehicle analytics
│       ├── promotions/              # CRUD and promo validation
│       ├── rentals/                 # Overlap-safe booking and status transitions
│       └── health/                  # Application/database liveness
├── components/                      # Shell, booking, auth, UI, and theme controls
├── db/                              # Drizzle schema, connection bootstrap, seed
└── lib/                             # Auth, i18n, pricing, formatting, HTTP helpers
```

## API overview

| Endpoint | Role | Purpose |
| --- | --- | --- |
| `POST /api/auth/register` · `login` · `logout` | Public | Session management |
| `GET /api/auth/me` | Signed in | Current role and profile |
| `GET /api/vehicles` | Both | Company fleet or renter marketplace |
| `POST /api/vehicles` | Company | Create vehicle |
| `GET/PATCH/DELETE /api/vehicles/[id]` | Company / renter read | Details, analytics, edit, status, delete |
| `GET /api/vehicles/[id]/availability` | Signed in | Busy periods, turnaround windows, and next available limit |
| `GET/POST /api/promotions` | Company | List and create promotions |
| `PATCH/DELETE /api/promotions/[id]` | Company | Edit, toggle, or delete promotion |
| `GET /api/promotions/validate` | Public | Validate a code for a vehicle and price |
| `GET/POST /api/rentals` | Both / renter create | Rental history and overlap-safe booking |
| `PATCH /api/rentals/[id]` | Both | Confirm, complete, cancel, or company billing adjustment |
| `GET/POST /api/services` | Company / renter read | Premium-service catalog and per-day prices |
| `PATCH/DELETE /api/services/[id]` | Company | Update price/availability or remove a service |
| `GET /api/rentals/[id]/invoice` | Authorized/share token | Complete invoice JSON and breakdown |
| `GET /api/rentals/[id]/invoice/pdf` | Authorized/share token | Printable/shareable PDF proposal or bill |
| `GET /api/health` | Public | Liveness and database check |

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Next.js development server |
| `npm run build` | Create a production build |
| `npm start` | Serve the production build |
| `npm run typecheck` | Run strict TypeScript checking |
| `npm run db:push` | Apply the Drizzle schema to PostgreSQL |
| `npm run db:seed` | Reset and seed realistic demo data |
