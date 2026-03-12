# HyeAero.AI — Aircraft Research & Valuation Consultant (Frontend)

Interactive **Research Dashboard** for [HyeAero.com/research](https://www.hye.aero/). Built with Next.js and Tailwind, it provides AI-assisted analysis plus a PhlyData aircraft explorer with ZoomInfo-enriched owner details.

## Features

- **Ask Consultant** — RAG-powered chat over Hye Aero’s sale history and market data (authenticated users). Export conversations to PDF.
- **Price Estimator** — Predictive valuation and time-to-sale, driven by backend sale history and models.
- **Resale Advisory** — Plain-English resale guidance and talking points for owners and brokers.
- **PhlyData Aircraft** — Paginated aircraft list (searchable by serial, registration, model, etc.) with a slide-over **Owner details** panel combining listings, FAA registry, and ZoomInfo company enrichment (website, phones, address, revenue, employees, industries, social URLs, etc.).
- **Tabs & layout** — Desktop dashboard with tabbed navigation and mobile bottom nav. Sign in / Sign out is a demo-only state switch; hook into real auth in production.
- **(Hidden UI) Market Comparison** — The backend and internal tab logic still support Market Comparison, but the tab is intentionally hidden from the navigation. You can re-enable it later without changing the API.

## Setup (local)

```bash
cd frontend
npm install
```

Create `.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
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

## Backend connection

- Chat is proxied via Next.js (`/api/chat` → backend `/api/rag/answer`).
- Market Comparison, Price Estimator, Resale Advisory, and Owner Details call the backend directly using `NEXT_PUBLIC_API_URL`.
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
