"use client";

import { useState, useRef, useEffect, useCallback, type KeyboardEvent } from "react";
import { jsPDF } from "jspdf";
import { Bot, Download, GripVertical, Loader2, Pencil, Plus, Send, MessageSquare, X } from "lucide-react";
import {
  API_BASE_URL,
  consultantReportImageProxyUrl,
  getConsultantQuota,
  mergeConsultantAircraftImageLists,
  parseConsultantAircraftImages,
  postRagAnswerStream,
  RAG_ABORT_USER_MESSAGE,
  type ConsultantAircraftImage,
} from "@/lib/api";
import { authHeaderRecord } from "@/lib/auth-token";
import { useAuth } from "@/contexts/AuthContext";
import { isStaffRole } from "@/lib/auth-api";

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
  /** Short status before first token (progress line from the assistant). */
  status?: string;
};

type PersistedMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: SourceItem[];
  data_used?: DataUsed | null;
  aircraft_images?: ConsultantAircraftImage[];
};

type SavedChatSession = {
  id: string;
  title: string;
  updatedAt: number;
  messages: PersistedMessage[];
};

const LS_CHATS = "hyeaero_consultant_chats_v1";
const LS_ACTIVE = "hyeaero_consultant_active_chat_id_v1";
const MAX_STORED_CHATS = 40;

function toPersistedMessages(messages: Message[]): PersistedMessage[] {
  return messages
    .filter((m) => !m.streaming && (m.content.trim() || m.role === "user"))
    .map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      sources: m.sources,
      data_used: m.data_used ?? null,
      aircraft_images: m.aircraft_images,
    }));
}

function rehydrateMessages(p: PersistedMessage[]): Message[] {
  return p.map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    sources: m.sources,
    data_used: m.data_used ?? undefined,
    aircraft_images: m.aircraft_images,
    streaming: false,
  }));
}

function chatTitleFromMessages(messages: Message[]): string {
  const u = messages.find((m) => m.role === "user" && m.content.trim());
  if (!u) return "New chat";
  const t = u.content.trim().replace(/\s+/g, " ");
  return t.length > 44 ? `${t.slice(0, 41)}…` : t;
}

/** Update or insert session; **array order** is tab order (left → right). New ids are prepended (new chat first). */
function mergeSession(
  sessions: SavedChatSession[],
  chatId: string,
  messages: Message[]
): SavedChatSession[] {
  const persisted = toPersistedMessages(messages);
  const title = chatTitleFromMessages(messages);
  const updatedAt = Date.now();
  const row: SavedChatSession = { id: chatId, title, updatedAt, messages: persisted };
  const idx = sessions.findIndex((s) => s.id === chatId);
  if (idx < 0) {
    return [row, ...sessions].slice(0, MAX_STORED_CHATS);
  }
  const next = [...sessions];
  next[idx] = row;
  return next;
}

function persistSessionsList(list: SavedChatSession[], activeId: string) {
  try {
    localStorage.setItem(LS_CHATS, JSON.stringify(list));
    localStorage.setItem(LS_ACTIVE, activeId);
  } catch {
    /* ignore */
  }
}

/** Move item from index `from` to index `to` (both refer to positions in the list before the move). */
function arrayMoveSession<T>(arr: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= arr.length || to >= arr.length) return [...arr];
  const next = [...arr];
  const [it] = next.splice(from, 1);
  next.splice(to, 0, it!);
  return next;
}

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

const WELCOME = `Hello — I'm HyeAero.AI, the aviation intelligence assistant for Hye Aero.

I can help with aircraft missions, specifications, ownership research, market insights, comparisons, and buyer advisory. What would you like to work on?`;

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
  const proxied = consultantReportImageProxyUrl(im.url);
  const [displaySrc, setDisplaySrc] = useState(() => proxied ?? im.url);

  const handleImgError = () => {
    if (proxied && displaySrc === proxied) {
      setDisplaySrc(im.url);
      return;
    }
    onImageError();
  };

  return (
    <a
      href={im.page_url || im.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group relative block rounded-lg overflow-hidden border border-slate-200 dark:border-slate-600 bg-slate-100 dark:bg-slate-900/50 aspect-[4/3] focus:outline-none focus:ring-2 focus:ring-accent/40"
      title={title}
    >
      {/* eslint-disable-next-line @next/next/no-img-element — proxy or direct; Next/Image cannot proxy arbitrary consultant URLs */}
      <img
        src={displaySrc}
        alt={alt || "Aircraft photo"}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        className="w-full h-full object-cover transition-transform group-hover:scale-[1.02]"
        onError={handleImgError}
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
  const label = status?.trim() || "Preparing your consultant response…";
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

type JsPdfWithLink = jsPDF & {
  textWithLink: (text: string, x: number, y: number, options: { url: string; maxWidth?: number }) => number;
};

/** Page or image URLs below each aircraft image in the report PDF (clickable where viewers support it). */
function appendPdfImageSourceLinks(
  doc: jsPDF,
  im: ConsultantAircraftImage,
  margin: number,
  y: number,
  maxWidth: number,
  lineHeight: number
): number {
  const page = (im.page_url || "").trim();
  const img = (im.url || "").trim();
  const primary = page || img;
  if (!primary) return y;

  const lh = lineHeight * 0.88;
  const linkDoc = doc as JsPdfWithLink;

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(70, 78, 96);
  y = wrapText(doc, "Source:", margin, y, maxWidth, lh);
  doc.setTextColor(15, 80, 170);
  try {
    const linesP = doc.splitTextToSize(primary, maxWidth);
    linkDoc.textWithLink(primary, margin, y, { url: primary, maxWidth });
    y += lh * Math.max(1, linesP.length);
  } catch {
    y = wrapText(doc, primary, margin, y, maxWidth, lh);
  }

  if (page && img && page !== img) {
    doc.setTextColor(70, 78, 96);
    y = wrapText(doc, "Image file:", margin, y + lh * 0.15, maxWidth, lh);
    doc.setTextColor(15, 80, 170);
    try {
      const linesI = doc.splitTextToSize(img, maxWidth);
      linkDoc.textWithLink(img, margin, y, { url: img, maxWidth });
      y += lh * Math.max(1, linesI.length);
    } catch {
      y = wrapText(doc, img, margin, y, maxWidth, lh);
    }
  }

  doc.setTextColor(0, 0, 0);
  doc.setFontSize(11);
  return y + lineHeight * 0.45;
}

/** Decode response body to PNG/JPEG data URLs for jsPDF (WebP → JPEG via canvas). */
async function responseToPdfImageData(res: Response): Promise<{ fmt: "JPEG" | "PNG"; data: string } | null> {
  if (!res.ok) return null;
  const blob = await res.blob();
  if (!blob.size || blob.size > 4_000_000) return null;
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onloadend = () => resolve(String(r.result || ""));
    r.onerror = () => reject(new Error("read"));
    r.readAsDataURL(blob);
  });
  const low = dataUrl.toLowerCase();
  if (low.startsWith("data:image/png")) return { fmt: "PNG", data: dataUrl };
  if (low.startsWith("data:image/jpeg") || low.startsWith("data:image/jpg"))
    return { fmt: "JPEG", data: dataUrl };
  if (low.startsWith("data:image/webp")) {
    try {
      const bmp = await createImageBitmap(blob);
      const c = document.createElement("canvas");
      c.width = bmp.width;
      c.height = bmp.height;
      const ctx = c.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(bmp, 0, 0);
      const jpeg = c.toDataURL("image/jpeg", 0.85);
      return { fmt: "JPEG", data: jpeg };
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Fetch remote image for PDF. Third-party CDNs block browser CORS, so we use the API proxy first.
 */
async function imageUrlToPdfFormat(url: string): Promise<{ fmt: "JPEG" | "PNG"; data: string } | null> {
  const trimmed = (url || "").trim();
  if (!trimmed.startsWith("http")) return null;
  try {
    const proxyUrl = `${API_BASE_URL}/api/rag/consultant-report-image?${new URLSearchParams({ url: trimmed })}`;
    const proxied = await fetch(proxyUrl, {
      mode: "cors",
      credentials: "omit",
      headers: { ...authHeaderRecord() },
    });
    const fromProxy = await responseToPdfImageData(proxied);
    if (fromProxy) return fromProxy;
  } catch {
    /* fall through */
  }
  try {
    const direct = await fetch(trimmed, { mode: "cors", credentials: "omit" });
    return await responseToPdfImageData(direct);
  } catch {
    return null;
  }
}

async function downloadReport(messages: Message[]) {
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
      doc.text("Aircraft images:", margin, y);
      y += lineHeight;
      doc.setFont("helvetica", "normal");
      const imgW = Math.min(maxWidth, 100);
      for (const im of m.aircraft_images.slice(0, 32)) {
        if (y > 200) {
          doc.addPage();
          y = margin;
        }
        const cap = `${sourceLabel(im.source)}${displayImageAlt(im.description) ? ` — ${displayImageAlt(im.description)}` : ""}`;
        y = wrapText(doc, cap, margin, y, maxWidth, lineHeight * 0.85);
        const loaded = await imageUrlToPdfFormat(im.url);
        if (loaded) {
          try {
            let h = 45;
            try {
              const props = (doc as unknown as { getImageProperties: (s: string) => { height: number; width: number } }).getImageProperties(loaded.data);
              h = (imgW * props.height) / Math.max(props.width, 1);
            } catch {
              h = 45;
            }
            if (y + h > 285) {
              doc.addPage();
              y = margin;
            }
            doc.addImage(loaded.data, loaded.fmt, margin, y, imgW, Math.min(h, 80));
            y += Math.min(h, 80) + lineHeight * 0.35;
          } catch {
            doc.setFontSize(10);
            y = wrapText(doc, "(Could not embed image in PDF.)", margin, y, maxWidth, lineHeight * 0.85);
            doc.setFontSize(11);
          }
        } else {
          doc.setFontSize(10);
          y = wrapText(doc, "(Image not embedded — use source link below.)", margin, y, maxWidth, lineHeight * 0.85);
          doc.setFontSize(11);
        }
        y = appendPdfImageSourceLinks(doc, im, margin, y, maxWidth, lineHeight);
      }
      y += lineHeight * 0.5;
    }
  }
  doc.save(`hyeaero-research-report-${new Date().toISOString().slice(0, 10)}.pdf`);
}

const MAX_RETRIES = 1;

const WELCOME_MSG: Message = { id: "0", role: "assistant", content: WELCOME, streaming: false };

function buildHistoryForApi(msgs: Message[]): Array<{ role: string; content: string }> {
  return msgs
    .filter((m) => !m.streaming && (m.role === "user" || m.content.trim()))
    .slice(-12)
    .map((m) => ({ role: m.role, content: m.content }));
}

export default function Chat({ onQuerySent, suggestedQuery, onSuggestedQueryConsumed }: ChatProps) {
  const { user, loading: authLoading } = useAuth();
  const staff = user ? isStaffRole(user.role) : false;

  const [hydrated, setHydrated] = useState(false);
  const [sessions, setSessions] = useState<SavedChatSession[]>([]);
  const [activeChatId, setActiveChatId] = useState("");
  const [messages, setMessages] = useState<Message[]>([WELCOME_MSG]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [quota, setQuota] = useState<Awaited<ReturnType<typeof getConsultantQuota>> | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(LS_CHATS);
      let list: SavedChatSession[] = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(list)) list = [];
      let aid = localStorage.getItem(LS_ACTIVE) || "";
      if (!list.length) {
        const id = generateId();
        const initialMsgs = toPersistedMessages([WELCOME_MSG]);
        list = [{ id, title: "New chat", updatedAt: Date.now(), messages: initialMsgs }];
        aid = id;
      } else if (!aid || !list.some((s) => s.id === aid)) {
        aid = list[0]!.id;
      }
      const active = list.find((s) => s.id === aid)!;
      setSessions(list);
      setActiveChatId(aid);
      setMessages(rehydrateMessages(active.messages));
    } catch {
      const id = generateId();
      const initialMsgs = toPersistedMessages([WELCOME_MSG]);
      setSessions([{ id, title: "New chat", updatedAt: Date.now(), messages: initialMsgs }]);
      setActiveChatId(id);
      setMessages(rehydrateMessages(initialMsgs));
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    const h = window.setTimeout(() => {
      try {
        setSessions((prev) => {
          const next = mergeSession(prev, activeChatId, messages);
          localStorage.setItem(LS_CHATS, JSON.stringify(next));
          localStorage.setItem(LS_ACTIVE, activeChatId);
          return next;
        });
      } catch {
        /* ignore quota / private mode */
      }
    }, 450);
    return () => window.clearTimeout(h);
  }, [messages, activeChatId, hydrated]);

  const refreshQuota = useCallback(async () => {
    if (staff) {
      setQuota({ unlimited: true, limit: null, used: null, remaining: null });
      return;
    }
    try {
      const q = await getConsultantQuota();
      setQuota(q);
    } catch {
      setQuota({ unlimited: true, limit: null, used: null, remaining: null });
    }
  }, [staff]);

  useEffect(() => {
    if (!hydrated || authLoading) return;
    void refreshQuota();
  }, [hydrated, authLoading, refreshQuota, user?.id]);

  const switchChat = useCallback(
    (targetId: string) => {
      if (!hydrated || targetId === activeChatId) return;
      setSessions((prev) => {
        const n = mergeSession(prev, activeChatId, messages);
        const t = n.find((s) => s.id === targetId);
        try {
          localStorage.setItem(LS_CHATS, JSON.stringify(n));
          localStorage.setItem(LS_ACTIVE, targetId);
        } catch {
          /* ignore */
        }
        requestAnimationFrame(() => {
          setActiveChatId(targetId);
          setMessages(t ? rehydrateMessages(t.messages) : [WELCOME_MSG]);
          setEditingId(null);
          setEditDraft("");
        });
        return n;
      });
    },
    [hydrated, activeChatId, messages]
  );

  const newChat = useCallback(() => {
    if (!hydrated) return;
    const newId = generateId();
    setSessions((prev) => {
      const n = mergeSession(prev, activeChatId, messages);
      const fresh: Message[] = [WELCOME_MSG];
      const n2 = mergeSession(n, newId, fresh);
      try {
        localStorage.setItem(LS_CHATS, JSON.stringify(n2));
        localStorage.setItem(LS_ACTIVE, newId);
      } catch {
        /* ignore */
      }
      return n2;
    });
    setActiveChatId(newId);
    setMessages([WELCOME_MSG]);
    setEditingId(null);
    setEditDraft("");
  }, [hydrated, activeChatId, messages]);

  const removeSession = useCallback(
    (id: string) => {
      if (!hydrated || isLoading) return;
      if (!window.confirm("Remove this chat from this browser? You can’t undo this.")) return;
      setSessions((prev) => {
        const list = mergeSession(prev, activeChatId, messages);
        const filtered = list.filter((s) => s.id !== id);
        if (filtered.length === 0) {
          const newId = generateId();
          const freshMsgs = toPersistedMessages([WELCOME_MSG]);
          const freshList: SavedChatSession[] = [
            { id: newId, title: "New chat", updatedAt: Date.now(), messages: freshMsgs },
          ];
          persistSessionsList(freshList, newId);
          requestAnimationFrame(() => {
            setActiveChatId(newId);
            setMessages([WELCOME_MSG]);
            setEditingId(null);
            setEditDraft("");
          });
          return freshList;
        }
        if (id === activeChatId) {
          const idx = list.findIndex((s) => s.id === id);
          const pick =
            idx > 0 ? list[idx - 1]! : list.length > idx + 1 ? list[idx + 1]! : filtered[0]!;
          persistSessionsList(filtered, pick.id);
          requestAnimationFrame(() => {
            setActiveChatId(pick.id);
            setMessages(rehydrateMessages(pick.messages));
            setEditingId(null);
            setEditDraft("");
          });
        } else {
          persistSessionsList(filtered, activeChatId);
        }
        return filtered;
      });
    },
    [hydrated, isLoading, activeChatId, messages]
  );

  const reorderSessionDrop = useCallback(
    (draggedId: string, dropTargetId: string) => {
      if (!hydrated || isLoading || draggedId === dropTargetId) return;
      setSessions((prev) => {
        const list = mergeSession(prev, activeChatId, messages);
        const fromIdx = list.findIndex((s) => s.id === draggedId);
        const toIdx = list.findIndex((s) => s.id === dropTargetId);
        if (fromIdx < 0 || toIdx < 0) return prev;
        const next = arrayMoveSession(list, fromIdx, toIdx);
        persistSessionsList(next, activeChatId);
        return next;
      });
    },
    [hydrated, isLoading, activeChatId, messages]
  );

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

  const atDailyLimit = Boolean(
    !staff &&
      quota &&
      !quota.unlimited &&
      quota.remaining !== null &&
      quota.remaining <= 0
  );

  const sendMessage = async (
    retryCount = 0,
    opts?: { textOverride?: string; priorMessages?: Message[]; clearInput?: boolean }
  ) => {
    const text = (opts?.textOverride ?? input).trim();
    if (!text || isLoading || atDailyLimit) return;

    const clearInput = opts?.clearInput !== false && opts?.textOverride === undefined;
    if (clearInput) setInput("");

    onQuerySent?.(text);
    setIsLoading(true);

    const assistantId = generateId();
    const userMsg: Message = { id: generateId(), role: "user", content: text };
    const base = opts?.priorMessages ?? messages;
    const history = buildHistoryForApi(base);

    setMessages([
      ...base,
      userMsg,
      {
        id: assistantId,
        role: "assistant",
        content: "",
        streaming: true,
        status: "Reviewing your request and assembling sources…",
      },
    ]);

    const runStream = async () => {
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
            const looksLikeRateLimit =
              typeof err === "string" &&
              (err.includes("429") || /daily|limit|quota|too many/i.test(err));
            if (!err || !looksLikeRateLimit) void refreshQuota();
          },
        });
      } catch (e) {
        const isTimeout = e instanceof Error && e.name === "AbortError";
        const shouldRetry = !isTimeout && retryCount < MAX_RETRIES;
        const errorMsg = isTimeout
          ? RAG_ABORT_USER_MESSAGE
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
          setTimeout(() => sendMessage(retryCount + 1, opts), 1500);
        }
      } finally {
        setIsLoading(false);
      }
    };

    void runStream();
  };

  const startEdit = (m: Message) => {
    if (isLoading || m.streaming) return;
    setEditingId(m.id);
    setEditDraft(m.content);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft("");
  };

  const commitEdit = async () => {
    const id = editingId;
    const draft = editDraft.trim();
    if (!id || !draft) {
      cancelEdit();
      return;
    }
    const idx = messages.findIndex((x) => x.id === id);
    if (idx < 0) {
      cancelEdit();
      return;
    }
    const prior = messages.slice(0, idx);
    cancelEdit();
    await sendMessage(0, { textOverride: draft, priorMessages: prior, clearInput: false });
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleDownloadPdf = async () => {
    if (pdfBusy) return;
    setPdfBusy(true);
    try {
      await downloadReport(messages);
    } finally {
      setPdfBusy(false);
    }
  };

  if (!hydrated) {
    return (
      <div className="flex flex-1 min-h-[200px] items-center justify-center bg-slate-50/50 dark:bg-slate-900/50 text-slate-500 text-sm">
        Loading chat…
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden bg-slate-50/50 dark:bg-slate-900/50 transition-colors duration-200">
      <div className="flex-shrink-0 border-b border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900/90 px-2 sm:px-3 py-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={newChat}
          disabled={isLoading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50"
        >
          <Plus className="w-3.5 h-3.5" aria-hidden />
          New chat
        </button>
        <div className="flex flex-1 min-w-0 items-center gap-1 overflow-x-auto scrollbar-ui py-0.5">
          {sessions.map((s) => (
            <div
              key={s.id}
              draggable={!isLoading}
              onDragStart={(e) => {
                if ((e.target as HTMLElement).closest("[data-tab-close]")) {
                  e.preventDefault();
                  return;
                }
                e.dataTransfer.setData("application/x-hyeaero-chat-id", s.id);
                e.dataTransfer.effectAllowed = "move";
                (e.currentTarget as HTMLElement).style.opacity = "0.65";
              }}
              onDragEnd={(e) => {
                (e.currentTarget as HTMLElement).style.opacity = "";
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
              }}
              onDrop={(e) => {
                e.preventDefault();
                const fromId = e.dataTransfer.getData("application/x-hyeaero-chat-id");
                if (fromId && fromId !== s.id) reorderSessionDrop(fromId, s.id);
              }}
              className={`group/tab relative inline-flex shrink-0 items-stretch max-w-[168px] sm:max-w-[228px] rounded-lg border text-xs transition-colors select-none ${
                s.id === activeChatId
                  ? "border-accent/50 bg-accent/10 text-accent dark:text-accent"
                  : "border-transparent bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
              } ${isLoading ? "cursor-default" : "cursor-grab active:cursor-grabbing"}`}
              title="Drag tab to reorder · click title to open"
            >
              <span
                className="flex shrink-0 items-center pl-1 pr-0.5 text-slate-400 dark:text-slate-500"
                aria-hidden
              >
                <GripVertical className="w-3.5 h-3.5 opacity-60" />
              </span>
              <div
                role="button"
                tabIndex={isLoading ? -1 : 0}
                onClick={() => !isLoading && switchChat(s.id)}
                onKeyDown={(e) => {
                  if (isLoading) return;
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    switchChat(s.id);
                  }
                }}
                title={s.title}
                className={`inline-flex min-w-0 flex-1 items-center gap-1 rounded-md py-1.5 pl-0.5 pr-6 text-left outline-none hover:bg-black/5 focus-visible:ring-2 focus-visible:ring-accent/40 dark:hover:bg-white/10 ${isLoading ? "pointer-events-none opacity-50" : ""}`}
                aria-disabled={isLoading}
              >
                <MessageSquare className="w-3 h-3 shrink-0 opacity-70" aria-hidden />
                <span className="truncate">{s.title}</span>
              </div>
              <button
                type="button"
                data-tab-close
                draggable={false}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  removeSession(s.id);
                }}
                disabled={isLoading}
                className="absolute top-0.5 right-0.5 z-10 flex h-5 w-5 items-center justify-center rounded-md text-slate-500 hover:bg-red-100 hover:text-red-600 dark:text-slate-400 dark:hover:bg-red-950/60 dark:hover:text-red-400 disabled:pointer-events-none disabled:opacity-40"
                aria-label={`Close chat: ${s.title}`}
                title="Close chat"
              >
                <X className="w-3 h-3" strokeWidth={2.5} aria-hidden />
              </button>
            </div>
          ))}
        </div>
        {!staff && quota && !quota.unlimited && quota.remaining !== null && (
          <span className="text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap">
            {quota.remaining > 0
              ? `${quota.remaining} question${quota.remaining === 1 ? "" : "s"} left today`
              : "Daily limit reached"}
          </span>
        )}
      </div>
      {atDailyLimit ? (
        <p className="flex-shrink-0 px-3 sm:px-4 py-2 text-xs text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-800">
          You have reached your daily consultant question limit. It resets at midnight UTC. Admins are not limited.
        </p>
      ) : null}
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
                <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary dark:bg-primary-light px-5 py-3.5 text-white text-[15px] leading-relaxed shadow-md space-y-2">
                  {editingId === m.id ? (
                    <div className="space-y-2">
                      <textarea
                        value={editDraft}
                        onChange={(e) => setEditDraft(e.target.value)}
                        rows={3}
                        className="w-full rounded-lg border border-white/30 bg-white/10 text-white placeholder-white/60 px-3 py-2 text-[15px] focus:outline-none focus:ring-2 focus:ring-white/40"
                        aria-label="Edit message"
                      />
                      <div className="flex gap-2 justify-end">
                        <button
                          type="button"
                          onClick={cancelEdit}
                          className="text-xs px-2 py-1 rounded-md bg-white/10 hover:bg-white/20"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => void commitEdit()}
                          disabled={!editDraft.trim() || isLoading}
                          className="text-xs px-2 py-1 rounded-md bg-white text-primary font-medium disabled:opacity-50"
                        >
                          Save &amp; resend
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="whitespace-pre-wrap">{m.content}</p>
                      {!m.streaming && !isLoading ? (
                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={() => startEdit(m)}
                            className="inline-flex items-center gap-1 text-[11px] text-white/80 hover:text-white"
                            aria-label="Edit message"
                          >
                            <Pencil className="w-3 h-3" />
                            Edit
                          </button>
                        </div>
                      ) : null}
                    </>
                  )}
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
                <ConsultantLoadingIndicator status="Initializing your session…" compact />
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
              disabled={isLoading || atDailyLimit}
              aria-label="Message"
            />
            <button
              type="button"
              onClick={() => sendMessage(0)}
              disabled={!input.trim() || isLoading || atDailyLimit}
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
              onClick={() => void handleDownloadPdf()}
              disabled={pdfBusy}
              className="text-xs font-medium text-slate-500 dark:text-slate-400 rounded-md py-1.5 px-2 transition-all duration-200 ease-out hover:text-accent hover:bg-accent/10 dark:hover:bg-accent/20 focus:outline-none focus:ring-2 focus:ring-accent/25 focus:ring-inset active:scale-[0.98] active:bg-accent/15 inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              {pdfBusy ? "Building PDF…" : "Download PDF report"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
