# Motiv

A full-stack fleet and car rental workspace for rental companies and drivers. Motiv includes role-based authentication, fleet and reservation CRUD, flexible hourly-to-monthly pricing, targeted promotions, customer and vehicle rental history, and a seeded SQLite demo database.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:5173`. The demo company workspace opens automatically. Sign out to use the authentication screen or switch between seeded company and renter accounts from the profile menu.

### Demo accounts

- Company: `olivia@northstar.rent` / `demo123`
- Renter: `alex@example.com` / `demo123`

Data is persisted locally in `data/motiv.db`.
