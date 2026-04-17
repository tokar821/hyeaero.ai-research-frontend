/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Isolated aircraft image search pipeline (evaluation / backend-side use only).
 *
 * - Uses an LLM to extract intent (tail/model/view) from user text.
 * - Uses SearchAPI (Bing Images) for retrieval (NOT Tavily).
 * - Validates aggressively: only return images whose *title* contains the required tail or model.
 * - Returns at most 3 images; never returns fallback unrelated aircraft.
 *
 * IMPORTANT: This module is designed to run on the server (Next.js route handlers / server actions).
 * Do not import it into client components.
 */

export type ImageView = "exterior" | "cabin" | "cockpit" | "interior" | "bedroom";

export type ImageIntent = {
  tail: string | null;
  model: string | null;
  view: ImageView | null;
};

export type ImageResult = {
  title: string;
  imageUrl: string;
  source: string;
};

export type AircraftImagesResponse =
  | { success: true; images: ImageResult[] }
  | { success: false; message: string };

const NORMALIZATION_MAP: Array<[string, string]> = [
  ["G650ER", "Gulfstream G650ER"],
  ["G650", "Gulfstream G650"],
  ["G700", "Gulfstream G700"],
  ["G800", "Gulfstream G800"],
  ["G550", "Gulfstream G550"],
  ["G500", "Gulfstream G500"],
  ["G600", "Gulfstream G600"],
  ["G280", "Gulfstream G280"],
  ["CL350", "Challenger 350"],
  ["CHALLENGER 350", "Challenger 350"],
  ["GLOBAL XRS", "Global Express XRS"],
  ["GLOBAL 6000", "Global 6000"],
  ["GLOBAL 6500", "Global 6500"],
  ["GLOBAL 7500", "Global 7500"],
  ["GLOBAL 8000", "Global 8000"],
  ["PHENOM 300", "Embraer Phenom 300"],
  ["PHENOM 100", "Embraer Phenom 100"],
];

const VIEW_SYNONYMS: Array<[ImageView, string[]]> = [
  ["cockpit", ["cockpit", "flight deck", "flightdeck"]],
  ["bedroom", ["bedroom", "stateroom", "master suite", "suite"]],
  ["interior", ["interior", "inside"]],
  ["cabin", ["cabin", "cabin layout", "seat", "seating", "salon"]],
  ["exterior", ["exterior", "outside", "ramp", "night", "walkaround"]],
];

function normalizeTail(raw: string): string {
  return (raw || "").trim().toUpperCase().replace(/\s+/g, "");
}

export function normalizeAircraftName(name: string): string {
  const raw = (name || "").trim();
  if (!raw) return raw;
  const upper = raw.toUpperCase();
  for (const [key, val] of NORMALIZATION_MAP) {
    if (upper.includes(key)) return val;
  }
  return raw;
}

function inferViewFromText(userInput: string): ImageView | null {
  const low = (userInput || "").toLowerCase();
  for (const [view, words] of VIEW_SYNONYMS) {
    if (words.some((w) => low.includes(w))) return view;
  }
  return null;
}

function safeJsonFromModel(text: string): any | null {
  const raw = (text || "").trim();
  if (!raw) return null;
  // Try direct JSON first.
  try {
    return JSON.parse(raw);
  } catch {
    // Try to extract the first JSON object.
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      return JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
}

async function llmExtractIntent(userInput: string): Promise<ImageIntent> {
  const apiKey = (process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) {
    // Deterministic fallback: infer view, try to pull a tail-ish token.
    const tailMatch = (userInput || "").match(/\bN[0-9]{1,5}[A-Z]{0,2}\b/i);
    const tail = tailMatch ? normalizeTail(tailMatch[0]) : null;
    const view = inferViewFromText(userInput);
    return { tail, model: null, view };
  }

  const prompt = `You extract structured aviation image intent.\n\nUser input:\n\"${(userInput || "").replace(/"/g, '\\"')}\"\n\nReturn JSON:\n{\n\"tail\": string | null,\n\"model\": string | null,\n\"view\": one of [\"exterior\",\"cabin\",\"cockpit\",\"interior\",\"bedroom\"] | null\n}\n\nRules:\n\n* Normalize tail numbers to uppercase\n* Prioritize tail over model\n* No explanation, only JSON`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_IMAGE_INTENT_MODEL || "gpt-4o-mini",
      temperature: 0,
      max_tokens: 120,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    }),
  });

  const payload = (await res.json().catch(() => null)) as any;
  const text = payload?.choices?.[0]?.message?.content as string | undefined;
  const obj = safeJsonFromModel(text || "");

  const tail = obj?.tail ? normalizeTail(String(obj.tail)) : null;
  const model = obj?.model ? normalizeAircraftName(String(obj.model).trim()) : null;
  const viewRaw = obj?.view ? String(obj.view).toLowerCase() : null;
  const view: ImageView | null =
    viewRaw && ["exterior", "cabin", "cockpit", "interior", "bedroom"].includes(viewRaw)
      ? (viewRaw as ImageView)
      : null;

  // If model is shorthand like "g650", normalize again.
  return {
    tail: tail || null,
    model: model || null,
    view: view ?? inferViewFromText(userInput),
  };
}

export async function extractImageIntent(userInput: string): Promise<ImageIntent> {
  const intent = await llmExtractIntent(userInput);
  // Enforce: tail wins over model.
  if (intent.tail) return { ...intent, model: null };
  return intent;
}

function clampToFiveWords(q: string): string {
  const words = (q || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return words.slice(0, 5).join(" ");
}

export function buildImageQuery(intent: ImageIntent): string {
  const view = intent.view || null;
  if (intent.tail) {
    return clampToFiveWords(`${intent.tail} ${view || "aircraft"}`);
  }
  if (intent.model) {
    return clampToFiveWords(`${intent.model} ${view || "cabin"}`);
  }
  return clampToFiveWords(`${view || "private jet cabin"}`);
}

export async function searchImages(query: string): Promise<ImageResult[]> {
  const apiKey = (process.env.SEARCHAPI_API_KEY || "").trim();
  if (!apiKey) return [];

  const q = (query || "").trim();
  if (!q) return [];

  const url = new URL("https://www.searchapi.io/api/v1/search");
  url.searchParams.set("engine", "bing_images");
  url.searchParams.set("q", q);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("safe_search", "moderate");
  url.searchParams.set("num", "5");

  const res = await fetch(url.toString(), { method: "GET" });
  if (!res.ok) return [];

  const data = (await res.json().catch(() => null)) as any;
  const images = Array.isArray(data?.images) ? (data.images as any[]) : [];

  const out: ImageResult[] = [];
  for (const item of images.slice(0, 5)) {
    if (!item || typeof item !== "object") continue;
    const title = String(item.title || "").trim();
    const orig = item.original && typeof item.original === "object" ? item.original : null;
    const imageUrl = String(orig?.link || "").trim();
    const src = item.source && typeof item.source === "object" ? item.source : null;
    const source = String(src?.name || "").trim() || String(src?.link || "").trim() || "web";
    if (!title || !imageUrl.startsWith("https://")) continue;
    out.push({ title, imageUrl, source });
  }
  return out;
}

export function validateImages(results: ImageResult[], intent: ImageIntent): ImageResult[] {
  const rows = Array.isArray(results) ? results : [];
  if (!rows.length) return [];

  if (intent.tail) {
    const t = normalizeTail(intent.tail);
    return rows.filter((r) => (r.title || "").toUpperCase().includes(t));
  }

  if (intent.model) {
    const m = String(intent.model).trim();
    if (!m) return [];
    const ml = m.toLowerCase();
    return rows.filter((r) => (r.title || "").toLowerCase().includes(ml));
  }

  return [];
}

export async function getAircraftImages(userInput: string): Promise<AircraftImagesResponse> {
  const intent = await extractImageIntent(userInput);
  const query = buildImageQuery(intent);
  const results = await searchImages(query);
  const validated = validateImages(results, intent);
  const top = validated.slice(0, 3);
  if (!top.length) {
    return { success: false, message: "I couldn’t find verified images for this aircraft." };
  }
  return { success: true, images: top };
}

