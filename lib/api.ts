/**
 * HyeAero.AI — API client for Aircraft Research & Valuation Consultant
 * Base URL: NEXT_PUBLIC_API_URL (default http://88.99.198.243)
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://88.99.198.243";

export type AircraftModelsResponse = { models: string[] };

export async function getAircraftModels(): Promise<AircraftModelsResponse> {
  const res = await fetch(`${API_URL}/api/aircraft-models`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error((err as { detail?: string }).detail || `API ${res.status}`);
  }
  return res.json() as Promise<AircraftModelsResponse>;
}

/** Models that have at least one sale in aircraft_sales — use for Price Estimator dropdown so selections return results. */
export type PriceEstimateModelsResponse = {
  models: string[];
  sample_request?: { model: string; region: string } | null;
  /** Example payloads from DB (model + region) that return a result. Use for testing. */
  test_payloads?: Array<{ model: string; region: string }>;
};

export async function getPriceEstimateModels(): Promise<PriceEstimateModelsResponse> {
  const res = await fetch(`${API_URL}/api/price-estimate-models`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error((err as { detail?: string }).detail || `API ${res.status}`);
  }
  return res.json() as Promise<PriceEstimateModelsResponse>;
}

type ApiOptions = {
  method?: string;
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
};

async function fetchApi<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const { method = "GET", body, headers = {} } = options;
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    ...(body !== undefined && body !== null ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error((err as { detail?: string }).detail || `API ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export type ChatResponse = { answer: string; sources?: unknown[]; error?: string | null };

export function postChat(query: string): Promise<ChatResponse> {
  return fetchApi<ChatResponse>("/api/rag/answer", { method: "POST", body: { query } });
}

export type MarketComparisonParams = {
  models: string[];
  region?: string | null;
  max_hours?: number | null;
  min_year?: number | null;
  max_year?: number | null;
  limit?: number;
};

export type MarketComparisonResponse = {
  rows: Array<Record<string, unknown>>;
  summary: string;
  error?: string | null;
};

export function postMarketComparison(params: MarketComparisonParams): Promise<MarketComparisonResponse> {
  return fetchApi<MarketComparisonResponse>("/api/market-comparison", { method: "POST", body: params });
}

export type PriceEstimateParams = {
  manufacturer?: string | null;
  model?: string | null;
  year?: number | null;
  flight_hours?: number | null;
  flight_cycles?: number | null;
  region?: string | null;
};

/** Aviacost operating cost & pre-owned price reference by aircraft type. */
export type AviacostReference = {
  name?: string | null;
  manufacturer_name?: string | null;
  category_name?: string | null;
  variable_cost_per_hour?: number | null;
  average_pre_owned_price?: number | null;
  fuel_gallons_per_hour?: number | null;
  normal_cruise_speed_kts?: number | null;
  seats_full_range_nm?: number | null;
  typical_passenger_capacity_max?: number | null;
  years_in_production?: string | null;
};

export type PriceEstimateResponse = {
  estimated_value_millions: number | null;
  range_low_millions: number | null;
  range_high_millions: number | null;
  confidence_pct: number;
  market_demand: string;
  vs_average_pct: number | null;
  time_to_sale_days: number | null;
  breakdown: Array<{ label: string; value_millions?: number }>;
  aviacost_reference?: AviacostReference | null;
  aircraftpost_fleet_reference?: {
    matches: AircraftpostFleetAircraftRow[];
    fleet_summary: {
      manufacturer?: string | null;
      model?: string | null;
      serial?: string | null;
      total_records: number;
      records_with_hours?: number;
      records_with_landings?: number;
      for_sale_count?: number;
      for_sale_rate?: number | null;
      airframe_hours?: { avg?: number | null; p10?: number | null; p50?: number | null; p90?: number | null };
      total_landings?: { avg?: number | null; p10?: number | null; p50?: number | null; p90?: number | null };
      top_bases?: Array<{ base_code: string | null; n: number }>;
      top_countries?: Array<{ country_code: string | null; n: number }>;
      note?: string | null;
    };
  } | null;
  error?: string | null;
  message?: string | null;
};

export function postPriceEstimate(params: PriceEstimateParams): Promise<PriceEstimateResponse> {
  return fetchApi<PriceEstimateResponse>("/api/price-estimate", { method: "POST", body: params });
}

export type ResaleAdvisoryParams = {
  query?: string | null;
  listing_id?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  year?: number | null;
};

export type ResaleAdvisoryResponse = {
  insight: string;
  sources?: unknown[];
  error?: string | null;
};

export function postResaleAdvisory(params: ResaleAdvisoryParams): Promise<ResaleAdvisoryResponse> {
  return fetchApi<ResaleAdvisoryResponse>("/api/resale-advisory", { method: "POST", body: params });
}

// PhlyData (Internal DB) aircraft list and owner lookup
export type PhlydataAircraftRow = {
  id: string;
  serial_number: string | null;
  registration_number: string | null;
  manufacturer: string | null;
  model: string | null;
  manufacturer_year: number | null;
  delivery_year: number | null;
  category: string | null;
};

export type PhlydataAircraftResponse = {
  aircraft: PhlydataAircraftRow[];
  total: number;
  page: number;
  page_size: number;
};

export async function getPhlydataAircraft(params?: { page?: number; page_size?: number; q?: string }): Promise<PhlydataAircraftResponse> {
  const { page = 1, page_size = 100, q } = params || {};
  const searchParams = new URLSearchParams();
  searchParams.set("page", String(page));
  searchParams.set("page_size", String(page_size));
  if (q && q.trim()) searchParams.set("q", q.trim());
  // Call same-origin Next proxy (avoids CORS/network issues from the browser).
  const res = await fetch(`/api/phlydata/aircraft?${searchParams}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error((err as { detail?: string }).detail || `API ${res.status}`);
  }
  return res.json() as Promise<PhlydataAircraftResponse>;
}

export type OwnerFromListing = {
  source_platform: string | null;
  seller: string | null;
  seller_contact_name: string | null;
  seller_phone: string | null;
  seller_email: string | null;
  seller_location: string | null;
  seller_broker: string | null;
  listing_status: string | null;
  ask_price: number | null;
  sold_price: number | null;
  date_listed: string | null;
  date_sold: string | null;
};

/** Unverified web search rows (Tavily) when registrant looks trustee-like + address present. */
export type FaaTavilyWebHints = {
  query: string | null;
  disclaimer: string | null;
  results: Array<{ title: string | null; url: string | null; content: string | null }>;
  error?: string | null;
};

/** OpenAI interpretation of Tavily snippets (not verified; may drive ZoomInfo ``faa_tavily_llm_hint``). */
export type FaaTavilyLlmSynthesis = {
  operating_company_name?: string | null;
  website?: string | null;
  phone?: string | null;
  confidence?: "high" | "medium" | "low" | "none" | string | null;
  summary?: string | null;
  suggested_zoominfo_query?: string | null;
  error?: string | null;
};

export type OwnerFromFaa = {
  registrant_name: string | null;
  street: string | null;
  street2: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  region: string | null;
  county: string | null;
  country: string | null;
  /** Tavily web results for trustee-like / corporate registrant + mailing address. */
  tavily_web_hints?: FaaTavilyWebHints | null;
  /** Optional LLM read of Tavily snippets → suggested operating company (may trigger ZoomInfo). */
  tavily_llm_synthesis?: FaaTavilyLlmSynthesis | null;
};

/** AircraftPost owner row (matched by serial + registration + make/model on fleet table). */
export type OwnerFromAircraftpost = {
  serial_number: string | null;
  registration_number: string | null;
  owner_name: string | null;
  /** When AircraftPost has no Owner label, backend may infer a name from owner_url (slug + optional LLM). */
  owner_name_inferred?: string | null;
  /** Company-style name derived from owner_url domain (e.g. fremontgroup.com → Fremont Group). */
  owner_name_from_domain?: string | null;
  owner_url: string | null;
  make_model_name: string | null;
  country_code: string | null;
  base_code: string | null;
  source_platform: string | null;
};

export type AircraftpostFleetAircraftRow = {
  id: string;
  aircraft_entity_id: number | null;
  make_model_id: number | null;
  make_model_name: string | null;
  serial_number: string | null;
  registration_number: string | null;
  mfr_year: number | null;
  eis_date: string | null;
  country_code: string | null;
  base_code: string | null;
  owner_url: string | null;
  airframe_hours: number | null;
  total_landings: number | null;
  prior_owners: number | null;
  for_sale: boolean | null;
  passengers: number | null;
  engine_program_type: string | null;
  apu_program: string | null;
  ingestion_date: string | null;
};

/** ZoomInfo company search result item (GTM Data API). */
export type ZoominfoCompany = {
  id: string | null;
  type?: string;
  attributes?: Record<string, unknown>; // e.g. name, website, address, industry
};

/** ZoomInfo contact/person search result item (GTM Data API). */
export type ZoominfoContact = {
  id: string | null;
  type?: string;
  attributes?: Record<string, unknown>; // e.g. fullName, firstName, lastName, companyName, phone, city
};

/** Which fields matched when we picked the best ZoomInfo result. */
export type ZoominfoMatched = {
  company?: boolean;
  person?: boolean;
  phone?: boolean;
  location?: boolean;
  /** ZoomInfo company website matched AircraftPost owner_url / registrant website hint. */
  website?: boolean;
  /** True when content/word match was weak and we used vector + LLM to pick best. */
  llm_fallback?: boolean;
};

/** How we chose the best ZoomInfo result: phone match, content/word score, or vector+LLM fallback. */
export type ZoominfoMatchMethod = "phone" | "content_score" | "llm_fallback";

export type ZoominfoEnrichmentItem = {
  query_name: string;
  source_platform?: string;
  field_name?: string;
  companies: ZoominfoCompany[];
  contacts: ZoominfoContact[];
  /** "company" | "contact" – which type is the best match. */
  best_result_type?: "company" | "contact";
  /** How we matched: phone, content_score, or llm_fallback. */
  match_method?: ZoominfoMatchMethod;
  /** "company" | "person" (how we classified the FAA registrant name). */
  registrant_type?: "company" | "person";
  /** Which data matched (company name, person name, phone, location). */
  matched?: ZoominfoMatched;
  /** Set when ZoomInfo was skipped or failed (e.g. token not set in backend .env). */
  zoominfo_error?: string;
  /** True when ZoomInfo Contacts Search scope must be enabled for person-like registrant names. */
  needs_contacts_admin_permission?: boolean;
  context_sent?: Record<string, unknown>;
};

export type PhlydataOwnersResponse = {
  aircraft: PhlydataAircraftRow | null;
  owners_from_listings: OwnerFromListing[];
  owners_from_faa: OwnerFromFaa[];
  /** Which owner backends returned rows (PhlyData tab: `faa` / FAA MASTER only; AircraftPost not used). */
  owner_lookup_sources?: ("faa" | "aircraftpost")[];
  /** How `faa_master` matched (see backend `faa_master_lookup`). */
  faa_master_match_kind?:
    | "n_number_serial"
    | "n_number_only"
    | "serial_model"
    | "serial_only"
    | null;
  /** AircraftPost owner/source rows (serial + tail registration + model). */
  owners_from_aircraftpost?: OwnerFromAircraftpost[];
  /** Owner/company data retrieved from ZoomInfo (primary display). */
  zoominfo_enrichment?: ZoominfoEnrichmentItem[];
  /** AircraftPost fleet enrichment (matched by serial + registration + make/model). */
  aircraftpost_fleet?: AircraftpostFleetAircraftRow[];
  message?: string;
  /** When ZoomInfo person/contact lookup fails due to missing scopes. */
  zoominfo_contacts_access_denied?: boolean;
  /** Backend (LLM+heuristics) hint: was the FAA registrant classified as person or company? */
  zoominfo_registrant_type_hint?: "person" | "company" | null;
};

export async function getPhlydataOwners(
  serial: string,
  manufacturer?: string | null,
  model?: string | null,
  /** Tail / N-number — sent for AircraftPost owner_url lookup (registration-only match). */
  registration?: string | null
): Promise<PhlydataOwnersResponse> {
  const params = new URLSearchParams({ serial: serial.trim() });
  if (manufacturer != null && String(manufacturer).trim()) params.set("manufacturer", String(manufacturer).trim());
  if (model != null && String(model).trim()) params.set("model", String(model).trim());
  if (registration != null && String(registration).trim()) params.set("registration", String(registration).trim());
  const res = await fetch(`${API_URL}/api/phlydata/owners?${params}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error((err as { detail?: string }).detail || `API ${res.status}`);
  }
  return res.json() as Promise<PhlydataOwnersResponse>;
}
