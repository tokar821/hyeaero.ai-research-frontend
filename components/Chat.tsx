"use client";

import { useState, useRef, useEffect } from "react";
import { jsPDF } from "jspdf";
import { Bot, Send, Download } from "lucide-react";
import { postRagAnswerStream } from "@/lib/api";

export type SourceItem = { entity_type?: string; entity_id?: string | null; score?: number };
export type DataUsed = Record<string, number>;

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: SourceItem[];
  data_used?: DataUsed | null;
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

function formatDataUsed(data_used: DataUsed): string {
  const total = Object.values(data_used).reduce((sum, n) => sum + (typeof n === "number" ? n : 0), 0);
  if (total <= 0) return "";
  return total === 1 ? "Based on 1 external source." : `Based on ${total} external sources.`;
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
              };
            })
          );
        },
      });
    } catch (e) {
      const isTimeout = e instanceof Error && e.name === "AbortError";
      const shouldRetry = !isTimeout && retryCount < MAX_RETRIES;
      const errorMsg = isTimeout
        ? "The request took too long. Try a shorter question, or increase NEXT_PUBLIC_RAG_TIMEOUT_MS (see README)."
        : "Sorry, the request failed. Check NEXT_PUBLIC_API_URL, CORS, and that the backend is running (see README).";
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
                      <span className="text-slate-500 dark:text-slate-400">{m.status || "Thinking…"}</span>
                    ) : null}
                    {m.content}
                    {m.streaming ? (
                      <span
                        className="inline-block w-0.5 h-4 ml-1 bg-accent align-middle animate-pulse rounded-sm"
                        aria-hidden
                      />
                    ) : null}
                  </div>
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
              <div className="w-8 h-8 rounded-full bg-accent flex-shrink-0 flex items-center justify-center text-white animate-pulse" aria-hidden>
                <Bot className="w-4 h-4" />
              </div>
              <div className="rounded-2xl rounded-bl-md bg-white dark:bg-slate-800 px-5 py-3.5 text-slate-500 dark:text-slate-400 text-[15px] border border-slate-100 dark:border-slate-600 shadow-sm">
                Checking resources…
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
