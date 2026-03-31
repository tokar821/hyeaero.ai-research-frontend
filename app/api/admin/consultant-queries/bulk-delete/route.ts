import { NextRequest, NextResponse } from "next/server";
import {
  consultantAdminNotConfiguredResponse,
  getBackendBaseUrl,
  getConsultantAdminKey,
  verifyConsultantAdminBearer,
} from "@/lib/admin-proxy";

export async function POST(req: NextRequest) {
  const adminKey = getConsultantAdminKey();
  if (!adminKey) {
    const { status, detail } = consultantAdminNotConfiguredResponse();
    return NextResponse.json({ detail }, { status });
  }
  if (!verifyConsultantAdminBearer(req)) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }
  const body = await req.text();
  const res = await fetch(`${getBackendBaseUrl()}/api/admin/consultant-queries/bulk-delete`, {
    method: "POST",
    headers: { "X-Admin-Key": adminKey, "Content-Type": "application/json" },
    body,
    cache: "no-store",
  });
  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: { "Content-Type": res.headers.get("content-type") || "application/json" },
  });
}
