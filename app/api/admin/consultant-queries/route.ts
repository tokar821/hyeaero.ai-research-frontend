import { NextRequest, NextResponse } from "next/server";
import {
  consultantAdminNotConfiguredResponse,
  getBackendBaseUrl,
  getConsultantAdminKey,
  verifyConsultantAdminBearer,
} from "@/lib/admin-proxy";

export async function GET(req: NextRequest) {
  const adminKey = getConsultantAdminKey();
  if (!adminKey) {
    const { status, detail } = consultantAdminNotConfiguredResponse();
    return NextResponse.json({ detail }, { status });
  }
  if (!verifyConsultantAdminBearer(req)) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }
  const incoming = new URL(req.url);
  const backend = new URL(`${getBackendBaseUrl()}/api/admin/consultant-queries`);
  incoming.searchParams.forEach((v, k) => backend.searchParams.set(k, v));
  const res = await fetch(backend.toString(), {
    headers: { "X-Admin-Key": adminKey },
    cache: "no-store",
  });
  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: { "Content-Type": res.headers.get("content-type") || "application/json" },
  });
}
