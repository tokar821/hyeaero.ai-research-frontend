import { NextRequest, NextResponse } from "next/server";
import {
  consultantAdminNotConfiguredResponse,
  getBackendBaseUrl,
  getConsultantAdminKey,
  verifyConsultantAdminBearer,
} from "@/lib/admin-proxy";

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const adminKey = getConsultantAdminKey();
  if (!adminKey) {
    const { status, detail } = consultantAdminNotConfiguredResponse();
    return NextResponse.json({ detail }, { status });
  }
  if (!verifyConsultantAdminBearer(req)) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const res = await fetch(`${getBackendBaseUrl()}/api/admin/consultant-queries/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { "X-Admin-Key": adminKey },
    cache: "no-store",
  });
  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: { "Content-Type": res.headers.get("content-type") || "application/json" },
  });
}
