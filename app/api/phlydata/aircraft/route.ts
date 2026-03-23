import { NextResponse } from "next/server";

/**
 * Optional same-origin proxy for `/api/phlydata/aircraft`.
 * The app now calls FastAPI directly from `getPhlydataAircraft` in `lib/api.ts` when CORS allows.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const search = url.searchParams.toString();

  // Prefer configured backend.
  // Render frontend and backend are separate services, so this MUST NOT default to localhost.
  const backendBase =
    process.env.PHLYDATA_BACKEND_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "http://localhost:8000";

  const backendUrl = `${backendBase}/api/phlydata/aircraft${search ? `?${search}` : ""}`;

  const res = await fetch(backendUrl, {
    method: "GET",
    headers: { Accept: "application/json" },
    // FastAPI is already using in-process caching, so don't add extra time-based caching here.
    cache: "no-store",
  });

  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}

