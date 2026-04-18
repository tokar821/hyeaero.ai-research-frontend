# HyeAero.AI — Aircraft Research & Valuation Consultant (Frontend)

Interactive **Research Dashboard** for [HyeAero.com/research](https://www.hye.aero/). Built with Next.js and Tailwind, it provides AI-assisted analysis plus a PhlyData aircraft explorer with ZoomInfo-enriched owner details.

## Features

- **Ask Consultant** — RAG-powered chat over Hye Aero’s sale history and market data (authenticated users). Export conversations to PDF.
- **Price Estimator** — Predictive valuation and time-to-sale, driven by backend sale history and models.
- **Resale Advisory** — Plain-English resale guidance and talking points for owners and brokers.
- **PhlyData Aircraft** — Paginated aircraft list (searchable by serial, registration, model, etc.) with a slide-over **Owner details** panel combining listings, FAA registry, and ZoomInfo company enrichment (website, phones, address, revenue, employees, industries, social URLs, etc.).
- **Tabs & layout** — Desktop dashboard with tabbed navigation and mobile bottom nav. Sign in / Sign out is a demo-only state switch; hook into real auth in production.
- **(Hidden UI) Market Comparison** — The backend and internal tab logic still support Market Comparison, but the tab is intentionally hidden from the navigation. You can re-enable it later without changing the API.
- **Admin: Consultant query log** — **`/admin/queries`** (admin / super_admin JWT) lists logged questions once Postgres is configured on the API. Legacy `X-Admin-Key` still works for non-browser tools. Set `CONSULTANT_QUERY_ANALYTICS_ENABLED=0` on the API only if you want to disable new log rows.
- **Sign in / Sign up** — **`/login`**, **`/signup`**. New accounts are **pending** until an admin sets **`active`** in **`/admin/users`**. Dashboard requires **active** status (`/`); **`/pending`** explains the wait.
- **User management** — **`/admin/users`** for **admin** and **super_admin**: add users (admins create **pending** only), edit role (`user` / `admin`), reset password, delete. **Only super admin** can change **status** (activate sign-ups or reject). **Super admin** also has **`/admin/admins`** (admin-role roster).

## Setup (local)

```bash
cd frontend
npm install
```

Create `.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
# Optional: same value as backend CONSULTANT_ANALYTICS_ADMIN_KEY for /admin/queries (never use NEXT_PUBLIC_ for this).
# CONSULTANT_ANALYTICS_ADMIN_KEY=
# Optional: private API base for server-side admin proxy (defaults to NEXT_PUBLIC_API_URL).
# INTERNAL_API_URL=http://localhost:8000
# Optional: browser wall-clock wait for consultant (sync + stream). Default 30 min if unset; set 0/off/never to disable client abort.
# NEXT_PUBLIC_RAG_TIMEOUT_MS=1800000
# Optional: SSE idle — abort only if no bytes for this long after the first chunk (default 20 min). 0 = off.
# NEXT_PUBLIC_RAG_STREAM_IDLE_MS=1200000
# Optional: show a canned demo reply if backend is offline
NEXT_PUBLIC_DEMO_CHAT=false
```

## Run (development)

1. Start the backend API (see `backend/README.md`):
   ```bash
   cd backend
   python runners/run_api.py
   ```

2. In a second terminal, start the frontend:
   ```bash
   cd frontend
   npm run dev
   ```

Open [http://localhost:3000](http://localhost:3000).

If the terminal fills with `GET /_next/static/... 404` and the UI breaks, stop dev, delete the `frontend/.next` folder, run `npm run dev` once, then hard-refresh the browser. Do not run two dev servers on port 3000. As an alternative bundler you can try `npm run dev:turbo`.

## Backend connection

- **Ask Consultant** uses **`POST /api/rag/answer/stream`** (SSE) so the reply appears **token-by-token** like ChatGPT. **PhlyData aircraft list** and other tools call FastAPI **directly** with `NEXT_PUBLIC_API_URL`. Legacy routes `app/api/chat` and `app/api/phlydata/aircraft` still exist for same-origin tools only.
- Market Comparison, Price Estimator, Resale Advisory, and Owner Details also use `NEXT_PUBLIC_API_URL`.
- The backend must send **CORS** `Access-Control-Allow-Origin` for your frontend origin (see `backend/api/main.py` / `CORS_ORIGINS`).
- The **Owner details** panel shows combined data from listings, FAA registry, and ZoomInfo (when enabled on the backend).

To show a demo reply when the backend is down, set:

```env
NEXT_PUBLIC_DEMO_CHAT=true
```

## Production build & deploy

```bash
cd frontend
npm run build
npm start    # serves the built app on port 3000 by default
```

For production, set:

```env
NEXT_PUBLIC_API_URL=https://your-backend-domain.example.com
```

and ensure the backend CORS settings allow that origin.
