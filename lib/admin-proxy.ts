/**
 * Server-side proxy to FastAPI admin routes. Set ``CONSULTANT_ANALYTICS_ADMIN_KEY`` in the
 * Next.js environment (same value as the backend) and send ``Authorization: Bearer <key>``
 * from the admin UI — the key is never embedded in client bundles.
 */

import type { NextRequest } from "next/server";

export function getBackendBaseUrl(): string {
  const raw =
    process.env.INTERNAL_API_URL?.trim() ||
    process.env.NEXT_PUBLIC_API_URL?.trim() ||
    "http://localhost:8000";
  return raw.replace(/\/$/, "");
}

export function getConsultantAdminKey(): string {
  return (process.env.CONSULTANT_ANALYTICS_ADMIN_KEY || "").trim();
}

export function verifyConsultantAdminBearer(req: NextRequest): boolean {
  const key = getConsultantAdminKey();
  if (!key) return false;
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  return token === key;
}

export function consultantAdminNotConfiguredResponse() {
  return { configured: false as const, status: 503 as const, detail: "CONSULTANT_ANALYTICS_ADMIN_KEY is not set on the Next.js server" };
}
