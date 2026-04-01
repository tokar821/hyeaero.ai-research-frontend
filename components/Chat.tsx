"use client";

import { useState, useRef, useEffect } from "react";
import { jsPDF } from "jspdf";
import { Bot, Send, Download, Loader2 } from "lucide-react";
import {
  mergeConsultantAircraftImageLists,
  parseConsultantAircraftImages,
  postRagAnswerStream,
  type ConsultantAircraftImage,
} from "@/lib/api";

export type SourceItem = { entity_type?: string; entity_id?: string | null; score?: number };
export type DataUsed = Record<string, number | string | unknown>;

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: SourceItem[];
  data_used?: DataUsed | null;
  /** Resolved aircraft photos (Tavily / scrape gallery / listing og) — same as backend ``aircraft_images``. */
  aircraft_images?: ConsultantAircraftImage[];
  /** True while SSE tokens are arriving (ChatGPT-style). */
  streaming?: boolean;
  /** Short status before first token (e.g. "Searching sources…"). */
  status?: string;
};

type ChatProps = {
  onQuerySent?: (query: string) => void;
  suggestedQuery?: string | null;
  onSuggestedQueryConsumed?: () => void;
};

/** Generate a unique ID; works in browsers and environments where crypto.randomUUID is missing */
function generateId(): string {
  if (typeof crypto !== "undefined" && typeof (crypto as { randomUUID?: () => string }).randomUUID === "function") {
    return (crypto as { randomUUID: () => string }).randomUUID();
  }
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6]! & 0x0f) | 0x40;
    bytes[8] = (bytes[8]! & 0x3f) | 0x80;
    const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

const WELCOME = `Hello! I'm your AI research consultant, checking resources for you. I can help you with:

• Aircraft model research and specifications
• Market value comparisons and trends
• Price estimations and valuations
• Resale potential analysis`;

/** Footer under assistant message — avoid summing all numeric data_used keys (that inflated "74 sources"). */
function formatDataUsed(data_used: DataUsed): string {
  const d = data_used as unknown as Record<string, unknown>;
  const parts: string[] = [];
  const nPhly = Number(d.phlydata_aircraft_rows || 0);
  const nList = Number(d.consultant_internal_listings || 0);
  const nSales = Number(d.consultant_internal_sales_comps || 0);
  const nTav = Number(d.tavily_results || 0);
  const nImg = Number(d.consultant_aircraft_image_count ?? 0);
  if (nPhly > 0) parts.push("PhlyData/FAA");
  if (nList > 0 || nSales > 0) parts.push("internal listings/sales");
  if (nTav > 0) parts.push("web search");
  if (nImg > 0) parts.push(`${nImg} photo URL${nImg === 1 ? "" : "s"}`);
  if (parts.length === 0) return "";
  return `Sources used: ${parts.join(" · ")}.`;
}

function sourceLabel(src: string | undefined): string {
  const s = (src || "").toLowerCase();
  if (s === "tavily") return "Web";
  if (s === "scrape_gallery") return "Listing gallery";
  if (s === "listing_og") return "Listing preview";
  return src || "Image";
}

function sectionTitleForSource(src: string): string {
  const s = src.toLowerCase();
  if (s === "tavily") return "Web images";
  if (s === "scrape_gallery") return "Marketplace gallery (scraped)";
  if (s === "listing_og") return "Listing preview (og:image)";
  return "Other";
}

const SOURCE_SECTION_ORDER = ["tavily", "scrape_gallery", "listing_og"] as const;

/** Heuristic buckets for Tavily/CDN URLs (paths rarely contain the tail). */
type TavilyVisualBucket = "exterior" | "cabin" | "more";

function tavilyImageBucket(im: ConsultantAircraftImage): TavilyVisualBucket {
  const blob = `${im.description || ""} ${im.url}`.toLowerCase();
  if (
    /\b(cabin|interior|inside|galley|seat|seating|cockpit|flight deck|salon|lav|berth|divan|upholstery)\b/.test(blob)
  ) {
    return "cabin";
  }
  if (
    /\b(exterior|ramp|taxi|takeoff|take-off|landing|airborne|in flight|fuselage|winglets|nose|tail fin|jetphotos)\b/.test(
      blob
    )
  ) {
    return "exterior";
  }
  return "more";
}

const TAVILY_BUCKET_ORDER: { key: TavilyVisualBucket; label: string }[] = [
  { key: "exterior", label: "Exterior views" },
  { key: "cabin", label: "Cabin & interior" },
  { key: "more", label: "More photos" },
];

/** Backend should strip these; keep frontend guard so broken loads never show Tavily disclaimer as visible alt text. */
function isPlaceholderImageDescription(desc: string | null | undefined): boolean {
  if (desc == null || !String(desc).trim()) return false;
  const low = String(desc).toLowerCase();
  if (low.startsWith("tavily") || low.includes("tavily image")) return true;
  const badSubstrings = [
    "verify visually",
    "tail-specific",
    "tail specific",
    "unverified image",
    "third-party",
    "third party",
  ];
  return badSubstrings.some((b) => low.includes(b));
}

function displayImageAlt(desc: string | null | undefined): string {
  if (!desc || isPlaceholderImageDescription(desc)) return "";
  const t = desc.trim();
  return t.length > 140 ? `${t.slice(0, 137)}…` : t;
}

function groupImagesBySource(images: ConsultantAircraftImage[]): Map<string, ConsultantAircraftImage[]> {
  const m = new Map<string, ConsultantAircraftImage[]>();
  for (const im of images) {
    const key = (im.source || "other").toLowerCase();
    if (!m.has(key)) m.set(key, []);
    m.get(key)!.push(im);
  }
  return m;
}

function ConsultantImageTile({
  im,
  title,
  onImageError,
}: {
  im: ConsultantAircraftImage;
  title: string;
  onImageError: () => void;
}) {
  const alt = displayImageAlt(im.description);

  return (
    <a
      href={im.page_url || im.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group relative block rounded-lg overflow-hidden border border-slate-200 dark:border-slate-600 bg-slate-100 dark:bg-slate-900/50 aspect-[4/3] focus:outline-none focus:ring-2 focus:ring-accent/40"
      title={title}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={im.url}
        alt={alt || "Aircraft photo"}
        loading="lazy"
        decoding="async"
        className="w-full h-full object-cover transition-transform group-hover:scale-[1.02]"
        onError={onImageError}
      />
      <span className="absolute bottom-1 left-1 right-1 flex flex-wrap gap-1 pointer-events-none">
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/60 text-white truncate max-w-full">
          {sourceLabel(im.source)}
        </span>
      </span>
    </a>
  );
}

function ImageTileGrid({
  items,
  reactKeyPrefix,
  bucketLabel,
}: {
  items: ConsultantAircraftImage[];
  reactKeyPrefix: string;
  /** When set, label is omitted if every tile fails to load (broken URL / hotlink). */
  bucketLabel?: string;
}) {
  const [failedUrls, setFailedUrls] = useState(() => new Set<string>());
  const markFailed = (url: string) => {
    setFailedUrls((prev) => {
      if (prev.has(url)) return prev;
      const next = new Set(prev);
      next.add(url);
      return next;
    });
  };

  const visible = items.filter((im) => !failedUrls.has(im.url));
  if (visible.length === 0) return null;

  const grid = (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {visible.map((im, i) => {
        const disp = displayImageAlt(im.description);
        const title = disp || (im.description && !isPlaceholderImageDescription(im.description) ? im.description : im.url);
        return (
          <ConsultantImageTile
            key={`${reactKeyPrefix}-${im.url}-${i}`}
            im={im}
            title={title}
            onImageError={() => markFailed(im.url)}
          />
        );
      })}
    </div>
  );

  if (!bucketLabel) return grid;

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-slate-600 dark:text-slate-400">{bucketLabel}</p>
      {grid}
    </div>
  );
}

function AircraftImageGallery({ images }: { images: ConsultantAircraftImage[] }) {
  if (!images.length) return null;
  const grouped = groupImagesBySource(images);
  const orderedKeys: string[] = [];
  for (const k of SOURCE_SECTION_ORDER) {
    if (grouped.has(k) && grouped.get(k)!.length) orderedKeys.push(k);
  }
  for (const k of grouped.keys()) {
    if (!orderedKeys.includes(k)) orderedKeys.push(k);
  }

  return (
    <div className="pl-1 mt-3 space-y-4">
      <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
        Aircraft images — from web search and listing sources (verify on the site; may not be this exact airframe)
      </p>
      {orderedKeys.map((sourceKey) => {
        const section = grouped.get(sourceKey);
        if (!section?.length) return null;

        if (sourceKey === "tavily") {
          const byBucket = new Map<TavilyVisualBucket, ConsultantAircraftImage[]>();
          for (const b of ["exterior", "cabin", "more"] as TavilyVisualBucket[]) {
            byBucket.set(b, []);
          }
          for (const im of section) {
            byBucket.get(tavilyImageBucket(im))!.push(im);
          }
          return (
            <div key={sourceKey} className="space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {sectionTitleForSource(sourceKey)}
              </p>
              {TAVILY_BUCKET_ORDER.map(({ key: bucketKey, label }) => {
                const bucket = byBucket.get(bucketKey) || [];
                if (!bucket.length) return null;
                return (
                  <ImageTileGrid
                    key={`${sourceKey}-${bucketKey}`}
                    items={bucket}
                    reactKeyPrefix={`${sourceKey}-${bucketKey}`}
                    bucketLabel={label}
                  />
                );
              })}
            </div>
          );
        }

        return (
          <div key={sourceKey} className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {sectionTitleForSource(sourceKey)}
            </p>
            <ImageTileGrid items={section} reactKeyPrefix={sourceKey} />
          </div>
        );
      })}
    </div>
  );
}

/** ChatGPT-style loading: spinner, typing dots, thin activity bar, backend status line */
function ConsultantLoadingIndicator({
  status,
  compact,
}: {
  status?: string;
  /** Minimal row (e.g. fallback before assistant message is mounted) */
  compact?: boolean;
}) {
  const label = status?.trim() || "Working on your answer…";
  return (
    <div
      className={`flex flex-col gap-2.5 ${compact ? "py-0.5" : "py-1"}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={label}
    >
      <div className="flex items-center gap-3">
        <Loader2
          className="consultant-spinner-icon h-[18px] w-[18px] sm:h-5 sm:w-5 text-accent"
          aria-hidden
        />
        <div className="flex items-center gap-[5px] h-6" aria-hidden>
          <span className="consultant-typing-dot w-2 h-2 rounded-full bg-slate-500 dark:bg-slate-400" />
          <span className="consultant-typing-dot w-2 h-2 rounded-full bg-slate-500 dark:bg-slate-400" />
          <span className="consultant-typing-dot w-2 h-2 rounded-full bg-slate-500 dark:bg-slate-400" />
        </div>
      </div>
      <div className="consultant-loading-bar-track w-full max-w-[220px] sm:max-w-[280px]" aria-hidden>
        <div className="consultant-loading-bar-fill" />
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400 leading-snug min-h-[1rem]">{label}</p>
    </div>
  );
}

function wrapText(doc: jsPDF, text: string, x: number, y: number, maxWidth: number, lineHeight: number): number {
  const lines = doc.splitTextToSize(text, maxWidth);
  lines.forEach((line: string) => {
    doc.text(line, x, y);
    y += lineHeight;
  });
  return y;
}

function downloadReport(messages: Message[]) {
  const doc = new jsPDF({ format: "a4", unit: "mm" });
  const margin = 20;
  const pageWidth = doc.internal.pageSize.getWidth();
  const maxWidth = pageWidth - margin * 2;
  let y = margin;
  const lineHeight = 6;
  doc.setFontSize(16);
  doc.text("HyeAero.AI — Research Chat Report", margin, y);
  y += 10;
  doc.setFontSize(10);
  doc.text(`Generated: ${new Date().toLocaleString()}`, margin, y);
  y += lineHeight * 2;
  doc.setFontSize(11);
  for (const m of messages) {
    if (y > 270) {
      doc.addPage();
      y = margin;
    }
    const label = m.role === "user" ? "You" : "Consultant";
    doc.setFont("helvetica", "bold");
    doc.text(label, margin, y);
    y += lineHeight;
    doc.setFont("helvetica", "normal");
    y = wrapText(doc, m.content, margin, y, maxWidth, lineHeight) + lineHeight;
    if (m.role === "assistant" && m.aircraft_images?.length) {
      y += lineHeight * 0.5;
      doc.setFont("helvetica", "bold");
      doc.text("Image URLs (open in browser):", margin, y);
      y += lineHeight;
      doc.setFont("helvetica", "normal");
      for (const im of m.aircraft_images.slice(0, 12)) {
        if (y > 275) {
          doc.addPage();
          y = margin;
        }
        const line = `${sourceLabel(im.source)} — ${im.url}`;
        y = wrapText(doc, line, margin, y, maxWidth, lineHeight * 0.85);
      }
      y += lineHeight * 0.5;
    }
  }
  doc.save(`hyeaero-research-report-${new Date().toISOString().slice(0, 10)}.pdf`);
}

const MAX_RETRIES = 1;

export default function Chat({ onQuerySent, suggestedQuery, onSuggestedQueryConsumed }: ChatProps) {
  const [messages, setMessages] = useState<Message[]>([
    { id: "0", role: "assistant", content: WELCOME },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // When user clicks a "Try these" suggestion in the sidebar, fill the input and clear the suggestion
  useEffect(() => {
    if (suggestedQuery != null && suggestedQuery.trim()) {
      setInput(suggestedQuery.trim());
      onSuggestedQueryConsumed?.();
    }
  }, [suggestedQuery, onSuggestedQueryConsumed]);

  // Auto-scroll to bottom when new messages or loading state appear
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, isLoading]);

  const sendMessage = async (retryCount = 0) => {
    const text = input.trim();
    if (!text || isLoading) return;

    const userMsg: Message = { id: generateId(), role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    onQuerySent?.(text);
    setIsLoading(true);

    const history = messages
      .slice(-12)
      .map((m) => ({ role: m.role, content: m.content }));
    const assistantId = generateId();
    setMessages((prev) => [
      ...prev,
      {
        id: assistantId,
        role: "assistant",
        content: "",
        streaming: true,
        status: "Checking resources…",
      },
    ]);

    try {
      await postRagAnswerStream(text, {
        history,
        onStatus: (message) => {
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, status: message } : m))
          );
        },
        onDelta: (chunk) => {
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id !== assistantId) return m;
              const next = (m.content || "") + chunk;
              return {
                ...m,
                content: next,
                status: next.length > 0 ? undefined : m.status,
              };
            })
          );
        },
        onDone: (payload) => {
          const sources = Array.isArray(payload.sources) ? payload.sources : [];
          const data_used =
            payload.data_used && typeof payload.data_used === "object"
              ? (payload.data_used as DataUsed)
              : null;
          const duRec = data_used as Record<string, unknown> | null;
          const ai = mergeConsultantAircraftImageLists(
            parseConsultantAircraftImages(payload.aircraft_images),
            duRec ? parseConsultantAircraftImages(duRec.aircraft_images) : []
          );
          const aiOut = ai.length > 0 ? ai : undefined;
          const err = payload.error;
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id !== assistantId) return m;
              let content = m.content || "";
              if (err && !content.trim()) {
                content = err;
              } else if (err && content.trim()) {
                content = `${content}\n\n(${err})`;
              } else if (!content.trim() && !err) {
                content = "I couldn't get a response. Please try again.";
              }
              return {
                ...m,
                content,
                streaming: false,
                status: undefined,
                sources: sources.length ? (sources as SourceItem[]) : undefined,
                data_used: data_used || undefined,
                aircraft_images: aiOut,
              };
            })
          );
        },
      });
    } catch (e) {
      const isTimeout = e instanceof Error && e.name === "AbortError";
      const shouldRetry = !isTimeout && retryCount < MAX_RETRIES;
      const errorMsg = isTimeout
        ? "This answer was taking longer than usual, so we stopped waiting. Try a shorter or more specific question, or try again in a moment."
        : "Sorry, something went wrong. Check your connection and that the app is available, then try again.";
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                content: shouldRetry ? "Retrying…" : errorMsg,
                streaming: false,
                status: undefined,
              }
            : m
        )
      );
      if (shouldRetry) {
        setTimeout(() => sendMessage(retryCount + 1), 1500);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleDownloadPdf = () => {
    downloadReport(messages);
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden bg-slate-50/50 dark:bg-slate-900/50 transition-colors duration-200">
      {/* Only this message area scrolls; input stays fixed at bottom */}
      <div
        className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-3 sm:px-4 py-4 sm:py-6 overscroll-contain scrollbar-ui"
        role="log"
        aria-live="polite"
        aria-label="Chat messages"
      >
        <div className="max-w-3xl mx-auto space-y-8">
          {messages.map((m) =>
            m.role === "user" ? (
              <div key={m.id} className="flex justify-end gap-3">
                <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary dark:bg-primary-light px-5 py-3.5 text-white text-[15px] leading-relaxed shadow-md">
                  {m.content}
                </div>
                <div className="w-8 h-8 rounded-full bg-primary/20 flex-shrink-0 flex items-center justify-center text-primary text-xs font-semibold" aria-hidden title="You">
                  U
                </div>
              </div>
            ) : (
              <div key={m.id} className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-accent flex-shrink-0 flex items-center justify-center text-white" aria-hidden>
                  <Bot className="w-4 h-4" />
                </div>
                <div className="max-w-[85%] space-y-1.5">
                  <div className="rounded-2xl rounded-bl-md bg-white dark:bg-slate-800 px-5 py-3.5 text-slate-800 dark:text-slate-200 text-[15px] leading-relaxed shadow-sm border border-slate-100 dark:border-slate-600 whitespace-pre-wrap">
                    {!m.content && (m.streaming || m.status) ? (
                      <ConsultantLoadingIndicator status={m.status} />
                    ) : null}
                    {m.content}
                    {m.streaming && m.content ? (
                      <span
                        className="inline-block w-0.5 h-4 ml-0.5 bg-accent align-middle animate-pulse rounded-sm"
                        aria-hidden
                      />
                    ) : null}
                  </div>
                  {!m.streaming && m.aircraft_images && m.aircraft_images.length > 0 ? (
                    <AircraftImageGallery images={m.aircraft_images} />
                  ) : null}
                  {!m.streaming &&
                  (!m.aircraft_images || m.aircraft_images.length === 0) &&
                  (Number((m.data_used as Record<string, unknown> | undefined)?.consultant_user_asked_photos) === 1 ||
                    Number((m.data_used as Record<string, unknown> | undefined)?.consultant_show_image_ui_context) ===
                      1) ? (
                    <p className="pl-1 mt-2 text-xs text-slate-500 dark:text-slate-400">
                      No image URLs matched from our web search or listing pipeline for this question. Try adding the
                      full registration or serial, or phrases like “photos” / “images” with the tail number.
                    </p>
                  ) : null}
                  {m.data_used && Object.keys(m.data_used).length > 0 && (
                    <p className="pl-1 text-xs text-slate-500 dark:text-slate-400 italic">
                      {formatDataUsed(m.data_used)}
                    </p>
                  )}
                </div>
              </div>
            )
          )}
          {isLoading && !messages.some((m) => m.streaming) && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-accent flex-shrink-0 flex items-center justify-center text-white" aria-hidden>
                <Bot className="w-4 h-4" />
              </div>
              <div className="rounded-2xl rounded-bl-md bg-white dark:bg-slate-800 px-5 py-3.5 border border-slate-100 dark:border-slate-600 shadow-sm min-w-0 max-w-[85%]">
                <ConsultantLoadingIndicator status="Starting…" compact />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} aria-hidden />
        </div>
      </div>

      {/* Fixed input area at bottom of chat card (never scrolls away) */}
      <div className="flex-shrink-0 px-3 sm:px-4 py-3 sm:py-4 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700 transition-colors duration-200">
        <div className="max-w-3xl mx-auto">
          <div className="flex gap-2 rounded-2xl border border-slate-200 dark:border-slate-600 bg-slate-50/80 dark:bg-slate-800/80 px-3 sm:px-4 py-2.5 shadow-sm transition-all duration-200 ease-out focus-within:bg-white dark:focus-within:bg-slate-800 focus-within:ring-2 focus-within:ring-accent/25 focus-within:border-accent/40">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about aircraft models, market values, or comparables…"
              rows={1}
              className="flex-1 min-h-[44px] sm:min-h-[46px] max-h-36 resize-none border-0 bg-transparent px-1 py-2.5 text-[15px] text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-0"
              disabled={isLoading}
              aria-label="Message"
            />
            <button
              type="button"
              onClick={() => sendMessage(0)}
              disabled={!input.trim() || isLoading}
              className="flex-shrink-0 rounded-xl bg-accent p-3 sm:p-2.5 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center text-white transition-all duration-200 ease-out hover:bg-accent-light hover:shadow-md focus:outline-none focus:ring-2 focus:ring-accent/40 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-slate-900 active:scale-95 active:bg-accent-light disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-accent disabled:hover:shadow-none"
              aria-label="Send"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs text-slate-400 dark:text-slate-500">Enter to send · Shift+Enter for new line</span>
            <button
              type="button"
              onClick={handleDownloadPdf}
              className="text-xs font-medium text-slate-500 dark:text-slate-400 rounded-md py-1.5 px-2 transition-all duration-200 ease-out hover:text-accent hover:bg-accent/10 dark:hover:bg-accent/20 focus:outline-none focus:ring-2 focus:ring-accent/25 focus:ring-inset active:scale-[0.98] active:bg-accent/15 inline-flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              Download PDF report
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
