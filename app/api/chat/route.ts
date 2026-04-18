/**
 * Legacy proxy: browser → Next → FastAPI. The UI now calls FastAPI directly via `postRagAnswer` in `lib/api.ts`
 * (one fewer hop). Keep this route for old clients or curl to same-origin only.
 */
import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_RAG_API_URL || "http://localhost:8000";

const CHAT_PROXY_CAP_MS = 7_200_000; // 2h
const CHAT_PROXY_FLOOR_MS = 30_000;

/** Legacy `/api/chat` proxy → FastAPI. Match generous consultant timeouts (slow networks). `0` = no abort. */
function resolveChatProxyTimeoutMs(): number {
  const raw = (process.env.CHAT_PROXY_TIMEOUT_MS ?? "").trim().toLowerCase();
  if (raw === "0" || raw === "off" || raw === "never" || raw === "false") {
    return 0;
  }
  const parsed = parseInt(process.env.CHAT_PROXY_TIMEOUT_MS || "", 10);
  const base = Number.isFinite(parsed) && parsed > 0 ? parsed : 1_800_000; // 30 min default
  return Math.min(CHAT_PROXY_CAP_MS, Math.max(CHAT_PROXY_FLOOR_MS, base));
}

const REQUEST_TIMEOUT_MS = resolveChatProxyTimeoutMs();

const DEMO_ANSWER =
  "Based on real-time market data, this is a placeholder response. Connect the backend (see README) for live answers.";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const query = body?.query;
    if (!query || typeof query !== "string") {
      return NextResponse.json({ error: "Missing query" }, { status: 400 });
    }
    const history = Array.isArray(body.history)
      ? body.history.filter((m: { role?: string; content?: string }) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string").map((m: { role: string; content: string }) => ({ role: m.role, content: m.content })).slice(-12)
      : undefined;

    const controller = new AbortController();
    const timeoutId =
      REQUEST_TIMEOUT_MS > 0
        ? setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
        : undefined;
    try {
      const res = await fetch(`${BACKEND_URL}/api/rag/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(history ? { query: query.trim(), history } : { query: query.trim() }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text();
        let message = "The research service is temporarily unavailable.";
        if (res.status === 503) message = "Service is starting or not configured. Check backend logs.";
        try {
          const err = JSON.parse(text);
          if (err.detail) message = err.detail;
        } catch {
          // use default message
        }
        return NextResponse.json(
          { answer: message, sources: [], data_used: null, aircraft_images: null, error: message },
          { status: 200 }
        );
      }

      const data = await res.json();
      return NextResponse.json({
        answer: data.answer ?? "",
        sources: data.sources ?? [],
        data_used: data.data_used ?? null,
        aircraft_images: data.aircraft_images ?? null,
        error: data.error ?? null,
      });
    } finally {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    }
  } catch (e) {
    const isTimeout =
      (e instanceof DOMException && e.name === "AbortError") ||
      (e instanceof Error && e.name === "AbortError");
    const message =
      process.env.NEXT_PUBLIC_DEMO_CHAT === "true"
        ? DEMO_ANSWER
        : isTimeout
          ? "The request took too long. Try a shorter or simpler question."
          : "Unable to reach the research service. Start the backend (python runners/run_api.py) and set NEXT_PUBLIC_API_URL.";
    return NextResponse.json(
      { answer: message, sources: [], data_used: null, aircraft_images: null, error: message },
      { status: 200 }
    );
  }
}
