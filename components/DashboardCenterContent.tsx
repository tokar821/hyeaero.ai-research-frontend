"use client";

import React from "react";
import { MessageCircle, Bot, Download, Loader2, Database, X, User, Building2, MapPin, Search, ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { jsPDF } from "jspdf";
import Chat from "./Chat";
import { postMarketComparison, postPriceEstimate, postResaleAdvisory } from "@/lib/api";
import type { MarketComparisonResponse, PriceEstimateResponse, ResaleAdvisoryResponse, PhlydataAircraftRow, PhlydataOwnersResponse, OwnerFromListing, OwnerFromFaa, FaaTavilyWebHints, FaaTavilyLlmSynthesis, ZoominfoEnrichmentItem, ZoominfoCompany, ZoominfoContact, ZoominfoMatched, ZoominfoMatchMethod, AviacostReference, AircraftpostFleetAircraftRow } from "@/lib/api";

/** Format FAA mailing address for readable multi-line display in Owner details. */
function faaAddressLines(o: OwnerFromFaa): { street: string | null; street2: string | null; cityStateZip: string | null; extras: string[] } {
  const street = o.street && String(o.street).trim() ? String(o.street).trim() : null;
  const street2 = o.street2 && String(o.street2).trim() ? String(o.street2).trim() : null;
  const cityStateZip = [o.city, o.state, o.zip_code].filter((s) => s && String(s).trim()).join(", ") || null;
  const extras: string[] = [];
  if (o.county && String(o.county).trim()) extras.push(`County: ${String(o.county).trim()}`);
  if (o.region && String(o.region).trim()) extras.push(`Region: ${String(o.region).trim()}`);
  return { street, street2, cityStateZip, extras };
}

function downloadComparisonPdf(result: MarketComparisonResponse, selectedModels: Set<string>, region: string) {
  const doc = new jsPDF({ format: "a4", unit: "mm", orientation: "landscape" });
  const margin = 14;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  doc.setFontSize(16);
  doc.text("HyeAero.AI — Market Comparison", margin, y);
  y += 8;
  doc.setFontSize(9);
  const subtitle = `Models: ${Array.from(selectedModels).join(", ")} | Region: ${region} | Generated: ${new Date().toLocaleString()}`;
  const subtitleLines = doc.splitTextToSize(subtitle, contentWidth);
  subtitleLines.forEach((line: string) => {
    doc.text(line, margin, y);
    y += 5;
  });
  y += 2;
  doc.text(result.summary || "", margin, y);
  y += 8;

  const cols = ["Manufacturer / Model", "Year", "Ask Price", "Sold Price", "Hours", "Location", "Status", "Days on Mkt", "Source"];
  const rowHeight = 6;
  const colWidths = [52, 10, 22, 22, 16, 48, 22, 14, 22];
  const colMaxLen = [32, 4, 12, 12, 8, 28, 12, 6, 14];
  const totalColWidth = colWidths.reduce((a, b) => a + b, 0);
  if (totalColWidth > contentWidth) {
    const scale = contentWidth / totalColWidth;
    colWidths.forEach((w, i) => { colWidths[i] = Math.floor(w * scale); });
  }

  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  let x = margin;
  cols.forEach((c, i) => {
    doc.text(c, x + 1, y);
    x += colWidths[i];
  });
  y += rowHeight;
  doc.setFont("helvetica", "normal");

  const drawCell = (text: string, cx: number, cy: number, w: number, maxLen: number) => {
    const s = String(text);
    const t = s.length <= maxLen ? s : s.slice(0, maxLen - 1) + "…";
    doc.text(t, cx + 1, cy);
  };

  for (const row of result.rows.slice(0, 40)) {
    if (y > pageHeight - 18) {
      doc.addPage("a4", "landscape");
      y = margin;
    }
    const manufacturerModel = [row.manufacturer, row.model].filter(Boolean).join(" ") || "—";
    const askPrice = row.ask_price != null ? `$${Number(row.ask_price).toLocaleString()}` : "—";
    const soldPrice = row.sold_price != null ? `$${Number(row.sold_price).toLocaleString()}` : "—";
    const hours = row.airframe_total_time != null ? String(row.airframe_total_time) : "—";
    const location = [row.location, row.based_at].filter(Boolean).join(" ") || "—";
    const status = (row.listing_status as string) || "—";
    const daysOnMarket = row.days_on_market != null ? String(row.days_on_market) : "—";
    const source = (row.source_platform as string) || "—";
    const cells = [manufacturerModel, row.manufacturer_year != null ? String(row.manufacturer_year) : "—", askPrice, soldPrice, hours, location, status, daysOnMarket, source];
    x = margin;
    cells.forEach((cell, i) => {
      drawCell(cell, x, y, colWidths[i], colMaxLen[i]);
      x += colWidths[i];
    });
    y += rowHeight;
  }
  doc.save(`hyeaero-market-comparison-${new Date().toISOString().slice(0, 10)}.pdf`);
}

function downloadValuationPdf(
  result: PriceEstimateResponse,
  form: { model: string; year: string; flightHours: string; flightCycles: string; location: string }
) {
  const doc = new jsPDF({ format: "a4", unit: "mm" });
  const margin = 20;
  let y = margin;
  doc.setFontSize(16);
  doc.text("HyeAero.AI — Price Estimate", margin, y);
  y += 8;
  doc.setFontSize(10);
  doc.text(`Generated: ${new Date().toLocaleString()}`, margin, y);
  y += 10;
  doc.setFontSize(11);
  doc.text("Inputs", margin, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.text(`Model: ${form.model || "—"}  |  Year: ${form.year || "—"}  |  Location: ${form.location || "—"}`, margin, y);
  y += 5;
  doc.text(`Flight hours: ${form.flightHours || "—"}  |  Flight cycles: ${form.flightCycles || "—"}`, margin, y);
  y += 12;
  doc.setFont("helvetica", "bold");
  doc.text("Estimated Market Value", margin, y);
  y += 7;
  doc.setFont("helvetica", "normal");
  doc.text(result.estimated_value_millions != null ? `$${result.estimated_value_millions}M` : "—", margin, y);
  y += 6;
  if (result.range_low_millions != null && result.range_high_millions != null) {
    doc.text(`Range: $${result.range_low_millions}M – $${result.range_high_millions}M`, margin, y);
    y += 6;
  }
  doc.text(`Confidence: ${result.confidence_pct}%  |  Market demand: ${result.market_demand}`, margin, y);
  y += 5;
  if (result.time_to_sale_days != null) doc.text(`Time to sale: ${result.time_to_sale_days} days`, margin, y);
  y += 8;
  if (result.breakdown && result.breakdown.length > 0) {
    doc.setFont("helvetica", "bold");
    doc.text("Value breakdown", margin, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    for (const row of result.breakdown) {
      doc.text(`${row.label}: ${row.value_millions != null ? `$${row.value_millions}M` : ""}`, margin, y);
      y += 5;
    }
  }
  if (result.message) {
    y += 5;
    doc.setFontSize(9);
    doc.text(result.message, margin, y);
  }
  doc.save(`hyeaero-valuation-${new Date().toISOString().slice(0, 10)}.pdf`);
}

function downloadResalePdf(query: string, result: ResaleAdvisoryResponse) {
  const doc = new jsPDF({ format: "a4", unit: "mm" });
  const margin = 20;
  const maxWidth = doc.internal.pageSize.getWidth() - margin * 2;
  const lineHeight = 6;
  let y = margin;

  doc.setFontSize(16);
  doc.text("HyeAero.AI — Resale Advisory", margin, y);
  y += 8;
  doc.setFontSize(10);
  doc.text(`Generated: ${new Date().toLocaleString()}`, margin, y);
  y += 10;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Query", margin, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  const queryLines = doc.splitTextToSize(query || "—", maxWidth);
  queryLines.forEach((line: string) => {
    doc.text(line, margin, y);
    y += lineHeight;
  });
  y += 6;
  doc.setFont("helvetica", "bold");
  doc.text("Resale guidance", margin, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const insightText = result.error ? result.error : (result.insight || "No guidance available.");
  const insightLines = doc.splitTextToSize(insightText, maxWidth);
  for (const line of insightLines) {
    if (y > 270) {
      doc.addPage();
      y = margin;
    }
    doc.text(line, margin, y);
    y += lineHeight;
  }
  if (result.sources && Array.isArray(result.sources) && result.sources.length > 0) {
    y += lineHeight;
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text(result.sources.length === 1 ? "Based on 1 external source." : `Based on ${result.sources.length} external sources.`, margin, y);
    doc.setTextColor(0, 0, 0);
  }
  doc.save(`hyeaero-resale-advisory-${new Date().toISOString().slice(0, 10)}.pdf`);
}

type TabId = "consultant" | "comparison" | "estimator" | "resale" | "phlydata";

export type DashboardCenterContentProps = {
  activeTab: TabId;
  isAuthenticated: boolean;
  selectedModels: Set<string>;
  toggleModel: (model: string) => void;
  onSelectAllModels?: () => void;
  onDeselectAllModels?: () => void;
  region: string;
  setRegion: (v: string) => void;
  timePeriod: string;
  setTimePeriod: (v: string) => void;
  comparisonFilters: { maxHours: string; minYear: string; maxYear: string };
  setComparisonFilters: React.Dispatch<React.SetStateAction<{ maxHours: string; minYear: string; maxYear: string }>>;
  aircraftModels: string[];
  aircraftModelsLoading: boolean;
  aircraftModelsError: string | null;
  estimatorModels?: string[];
  estimatorModelsLoading?: boolean;
  samplePriceRequest?: { model: string; region: string } | null;
  priceTestPayloads?: Array<{ model: string; region: string }>;
  metrics: { marketValue: boolean; priceTrends: boolean; transactionVolume: boolean; daysOnMarket: boolean };
  setMetrics: React.Dispatch<React.SetStateAction<{ marketValue: boolean; priceTrends: boolean; transactionVolume: boolean; daysOnMarket: boolean }>>;
  estimatorForm: { model: string; year: string; flightHours: string; flightCycles: string; location: string };
  setEstimatorForm: React.Dispatch<React.SetStateAction<{ model: string; year: string; flightHours: string; flightCycles: string; location: string }>>;
  comparisonResult: MarketComparisonResponse | null;
  comparisonLoading: boolean;
  comparisonError: string | null;
  handleGenerateComparison: () => void;
  priceResult: PriceEstimateResponse | null;
  priceLoading: boolean;
  handlePriceEstimate: () => void;
  resaleQuery: string;
  setResaleQuery: (v: string) => void;
  resaleResult: ResaleAdvisoryResponse | null;
  resaleLoading: boolean;
  handleResaleAdvisory: () => void;
  onConsultantQuerySent?: (query: string) => void;
  suggestedQuery?: string | null;
  onSuggestedQueryConsumed?: () => void;
  phlydataAircraft?: PhlydataAircraftRow[];
  phlydataTotal?: number;
  phlydataPage?: number;
  phlydataPageSize?: number;
  setPhlydataPage?: (p: number | ((prev: number) => number)) => void;
  setPhlydataPageSize?: (size: number) => void;
  phlydataSearch?: string;
  setPhlydataSearch?: (v: string) => void;
  phlydataLoading?: boolean;
  phlydataError?: string | null;
  phlydataOwnerDetail?: PhlydataOwnersResponse | null;
  phlydataDetailLoading?: boolean;
  onPhlydataRowClick?: (
    serial: string,
    manufacturer?: string | null,
    model?: string | null,
    registration?: string | null
  ) => void;
  onPhlydataCloseDetail?: () => void;
};

export default function DashboardCenterContent(props: DashboardCenterContentProps) {
  const {
    activeTab,
    isAuthenticated,
    selectedModels,
    toggleModel,
    onSelectAllModels,
    onDeselectAllModels,
    region,
    setRegion,
    timePeriod,
    setTimePeriod,
    comparisonFilters,
    setComparisonFilters,
    aircraftModels,
    aircraftModelsLoading,
    aircraftModelsError,
    estimatorModels,
    estimatorModelsLoading,
    samplePriceRequest,
    priceTestPayloads = [],
    metrics,
    setMetrics,
    estimatorForm,
    setEstimatorForm,
    comparisonResult,
    comparisonLoading,
    comparisonError,
    handleGenerateComparison,
    priceResult,
    priceLoading,
    handlePriceEstimate,
    resaleQuery,
    setResaleQuery,
    resaleResult,
    resaleLoading,
    handleResaleAdvisory,
    onConsultantQuerySent,
    suggestedQuery,
    onSuggestedQueryConsumed,
    phlydataAircraft = [],
    phlydataTotal = 0,
    phlydataPage = 1,
    phlydataPageSize = 100,
    setPhlydataPage,
    setPhlydataPageSize,
    phlydataSearch = "",
    setPhlydataSearch,
    phlydataLoading = false,
    phlydataError = null,
    phlydataOwnerDetail = null,
    phlydataDetailLoading = false,
    onPhlydataRowClick,
    onPhlydataCloseDetail,
  } = props;

  const [phlydataSortKey, setPhlydataSortKey] = React.useState<"serial_number" | "registration_number" | "manufacturer_model" | "manufacturer_year" | "category">("serial_number");
  const [phlydataSortDir, setPhlydataSortDir] = React.useState<"asc" | "desc">("asc");

  if (activeTab === "consultant") {
    return (
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden bg-white dark:bg-slate-900">
        <div className="flex-shrink-0 px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex items-center gap-3 transition-colors duration-200">
          <div className="w-9 h-9 rounded-lg bg-accent flex items-center justify-center text-white">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-heading font-semibold text-slate-900 dark:text-slate-100">HyeAero.AI</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Aviation intelligence assistant for Hye Aero — missions, specs, ownership, market insights.
            </p>
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
          <Chat
            onQuerySent={onConsultantQuerySent}
            suggestedQuery={suggestedQuery ?? undefined}
            onSuggestedQueryConsumed={onSuggestedQueryConsumed}
          />
        </div>
      </div>
    );
  }

  if (activeTab === "comparison") {
    return (
      <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 scrollbar-ui bg-white dark:bg-slate-900">
        <div className="max-w-4xl mx-auto">
          <h2 className="font-heading text-lg sm:text-xl font-semibold text-slate-800 dark:text-slate-100">Market Comparison Tool</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Compare aircraft values across models, regions, and time periods.</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Select Aircraft Models</label>
                {aircraftModels.length > 0 && !aircraftModelsLoading && (
                  <span className="flex items-center gap-2 text-xs">
                    <button type="button" onClick={onSelectAllModels} className="text-accent hover:underline font-medium dark:text-accent-light">
                      Select all
                    </button>
                    <span className="text-slate-300 dark:text-slate-500">|</span>
                    <button type="button" onClick={onDeselectAllModels} className="text-slate-500 dark:text-slate-400 hover:underline hover:text-slate-700 dark:hover:text-slate-300">
                      Deselect all
                    </button>
                  </span>
                )}
              </div>
              <div className="border border-slate-200 dark:border-slate-600 rounded-lg bg-slate-50/50 dark:bg-slate-800 max-h-48 overflow-y-auto p-2 scrollbar-ui">
                {aircraftModelsLoading ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400 py-3 px-2">Loading models from database…</p>
                ) : aircraftModelsError ? (
                  <p className="text-sm text-red-600 dark:text-red-400 py-3 px-2">{aircraftModelsError}</p>
                ) : aircraftModels.length === 0 ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400 py-3 px-2">No aircraft models in database. Load aircraft data first.</p>
                ) : (
                  aircraftModels.map((model) => (
                    <label
                      key={model}
                      className={`flex items-center gap-2 py-2 px-2 rounded-md cursor-pointer transition-all duration-200 ease-out hover:bg-white hover:shadow-sm dark:hover:bg-slate-600 dark:shadow-none ${selectedModels.has(model) ? "dark:bg-slate-600/80" : ""}`}
                    >
                      <input type="checkbox" checked={selectedModels.has(model)} onChange={() => toggleModel(model)} className="rounded border-slate-300 dark:border-slate-500 dark:bg-slate-700 text-accent focus:ring-accent focus:ring-offset-0 dark:focus:ring-offset-slate-800" />
                      <span className="text-sm text-slate-700 dark:text-slate-200">{model}</span>
                    </label>
                  ))
                )}
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Region</label>
                <select value={region} onChange={(e) => setRegion(e.target.value)} disabled={comparisonLoading} className="w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 transition-all duration-200 ease-out focus:border-accent focus:ring-2 focus:ring-accent/25 hover:border-slate-300 dark:hover:border-slate-500 disabled:opacity-60">
                  <option>Global</option>
                  <option>North America</option>
                  <option>Europe</option>
                  <option>Asia Pacific</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Max airframe hours (optional)</label>
                <input type="number" min={0} step={100} placeholder="e.g. 5000" value={comparisonFilters.maxHours} onChange={(e) => setComparisonFilters((f) => ({ ...f, maxHours: e.target.value }))} disabled={comparisonLoading} className="w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 transition-all duration-200 ease-out focus:border-accent focus:ring-2 focus:ring-accent/25 hover:border-slate-300 dark:hover:border-slate-500 disabled:opacity-60" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Min year</label>
                  <input type="number" min={1990} max={2030} placeholder="e.g. 2010" value={comparisonFilters.minYear} onChange={(e) => setComparisonFilters((f) => ({ ...f, minYear: e.target.value }))} disabled={comparisonLoading} className="w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 transition-all duration-200 ease-out focus:border-accent focus:ring-2 focus:ring-accent/25 hover:border-slate-300 dark:hover:border-slate-500 disabled:opacity-60" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Max year</label>
                  <input type="number" min={1990} max={2030} placeholder="e.g. 2020" value={comparisonFilters.maxYear} onChange={(e) => setComparisonFilters((f) => ({ ...f, maxYear: e.target.value }))} disabled={comparisonLoading} className="w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 transition-all duration-200 ease-out focus:border-accent focus:ring-2 focus:ring-accent/25 hover:border-slate-300 dark:hover:border-slate-500 disabled:opacity-60" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Time period (reference)</label>
                <select value={timePeriod} onChange={(e) => setTimePeriod(e.target.value)} disabled={comparisonLoading} className="w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 transition-all duration-200 ease-out focus:border-accent focus:ring-2 focus:ring-accent/25 hover:border-slate-300 dark:hover:border-slate-500 disabled:opacity-60">
                  <option>Last 30 Days</option>
                  <option>Last 90 Days</option>
                  <option>Last 12 Months</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Comparison Metrics</label>
              <div className="space-y-2">
                {["marketValue", "priceTrends", "transactionVolume", "daysOnMarket"].map((key, i) => (
                  <label key={key} className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={metrics[key as keyof typeof metrics]} onChange={(e) => setMetrics((m) => ({ ...m, [key]: e.target.checked }))} className="rounded border-slate-300 dark:border-slate-500 dark:bg-slate-800 text-accent focus:ring-accent focus:ring-offset-0 dark:focus:ring-offset-slate-900" />
                    <span className="text-sm text-slate-700 dark:text-slate-300">{["Market Value", "Price Trends", "Transaction Volume", "Days on Market"][i]}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <button type="button" onClick={handleGenerateComparison} disabled={comparisonLoading || selectedModels.size < 1} className="mt-6 w-full sm:w-auto rounded-lg bg-accent px-5 py-3 sm:py-2.5 min-h-touch sm:min-h-0 text-white text-sm font-medium transition-all duration-200 ease-out hover:bg-accent-light hover:shadow-md focus:outline-none focus:ring-2 focus:ring-accent/40 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-slate-900 active:scale-[0.98] active:bg-accent-light disabled:opacity-50 disabled:hover:bg-accent disabled:hover:shadow-none inline-flex items-center justify-center gap-2">
            {comparisonLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {comparisonLoading ? "Loading…" : "Generate Comparison"}
          </button>
          {comparisonError && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{comparisonError}</p>}
          {comparisonLoading && (
            <div className="mt-6 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50/50 dark:bg-slate-800/80 p-8 flex items-center justify-center gap-2">
              <Loader2 className="w-5 h-5 animate-spin text-accent" />
              <span className="text-slate-600 dark:text-slate-300">Fetching comparable listings…</span>
            </div>
          )}
          {comparisonResult && comparisonResult.rows.length > 0 && !comparisonLoading && (
            <div className="mt-6">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <p className="text-sm text-slate-600 dark:text-slate-300">{comparisonResult.summary}</p>
                <button type="button" onClick={() => downloadComparisonPdf(comparisonResult, selectedModels, region)} className="text-sm font-medium text-slate-600 rounded-md py-1.5 px-2 transition-all duration-200 ease-out hover:text-accent hover:bg-accent/10 focus:outline-none focus:ring-2 focus:ring-accent/25 focus:ring-inset active:scale-[0.98] active:bg-accent/15 inline-flex items-center gap-1.5">
                  <Download className="w-4 h-4" />
                  Download PDF
                </button>
              </div>
              <div className="overflow-x-auto overflow-y-hidden rounded-lg border border-slate-200 dark:border-slate-600 w-full scrollbar-ui">
                <table className="w-full min-w-[800px] text-sm table-auto" style={{ tableLayout: "auto" }}>
                  <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-600">
                    <tr>
                      <th className="text-left py-2 px-3 font-medium text-slate-700 dark:text-slate-200 min-w-[140px]">Manufacturer / Model</th>
                      <th className="text-left py-2 px-3 font-medium text-slate-700 dark:text-slate-200 w-14">Year</th>
                      {metrics.marketValue && <th className="text-right py-2 px-3 font-medium text-slate-700 dark:text-slate-200 min-w-[90px]">Ask Price</th>}
                      {metrics.marketValue && <th className="text-right py-2 px-3 font-medium text-slate-700 dark:text-slate-200 min-w-[90px]">Sold Price</th>}
                      <th className="text-right py-2 px-3 font-medium text-slate-700 dark:text-slate-200 min-w-[60px]">Hours</th>
                      <th className="text-left py-2 px-3 font-medium text-slate-700 dark:text-slate-200 min-w-[160px]">Location</th>
                      <th className="text-left py-2 px-3 font-medium text-slate-700 dark:text-slate-200 min-w-[80px]">Status</th>
                      {metrics.daysOnMarket && <th className="text-right py-2 px-3 font-medium text-slate-700 dark:text-slate-200 min-w-[70px]">Days on Mkt</th>}
                      <th className="text-left py-2 px-3 font-medium text-slate-700 dark:text-slate-200 min-w-[80px]">Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparisonResult.rows.map((row: Record<string, unknown>, i: number) => (
                      <tr key={i} className="border-b border-slate-100 dark:border-slate-700 transition-colors duration-200 hover:bg-accent/10 dark:hover:bg-accent/15">
                        <td className="py-2 px-3 min-w-[140px] align-top">{[row.manufacturer, row.model].filter(Boolean).join(" ") || "—"}</td>
                        <td className="py-2 px-3 w-14 align-top">{row.manufacturer_year != null ? String(row.manufacturer_year) : "—"}</td>
                        {metrics.marketValue && <td className="py-2 px-3 text-right min-w-[90px] align-top">{row.ask_price != null ? `$${Number(row.ask_price).toLocaleString()}` : "—"}</td>}
                        {metrics.marketValue && <td className="py-2 px-3 text-right min-w-[90px] align-top">{row.sold_price != null ? `$${Number(row.sold_price).toLocaleString()}` : "—"}</td>}
                        <td className="py-2 px-3 text-right min-w-[60px] align-top">{row.airframe_total_time != null ? String(row.airframe_total_time) : "—"}</td>
                        <td className="py-2 px-3 min-w-[160px] max-w-[320px] align-top break-words whitespace-normal">{[row.location, row.based_at].filter(Boolean).join(" · ") || "—"}</td>
                        <td className="py-2 px-3 min-w-[80px] align-top">{(row.listing_status as string) || "—"}</td>
                        {metrics.daysOnMarket && <td className="py-2 px-3 text-right min-w-[70px] align-top">{row.days_on_market != null ? String(row.days_on_market) : "—"}</td>}
                        <td className="py-2 px-3 min-w-[80px] align-top">{(row.source_platform as string) || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {comparisonResult && comparisonResult.rows.length === 0 && !comparisonLoading && (
            <div className="mt-6 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50/50 dark:bg-slate-800/80 p-6 text-center">
              <p className="text-slate-600 dark:text-slate-300">{comparisonResult.summary || "No comparable listings found."}</p>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Try different models, region, or relax filters (max hours, year range).</p>
            </div>
          )}
          {!comparisonResult && !comparisonLoading && (
            <div className="mt-8 rounded-lg border border-dashed border-slate-200 dark:border-slate-600 bg-slate-50/50 dark:bg-slate-800/80 p-8 text-center">
              <p className="font-medium text-slate-700 dark:text-slate-200">Select Aircraft Models to Compare</p>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Choose at least 1 aircraft model and click &quot;Generate Comparison&quot;.</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (activeTab === "estimator") {
    return (
      <div className="flex-1 min-h-0 overflow-y-auto lg:overflow-hidden p-6 scrollbar-ui bg-white dark:bg-slate-900">
        <div className="max-w-4xl mx-auto rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-sm overflow-hidden transition-colors duration-200 lg:h-[calc(100vh-9rem)] lg:min-h-0">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 lg:h-full">
            <div className="p-6 border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-slate-600 lg:overflow-hidden">
              <h2 className="font-heading text-xl font-semibold text-slate-900 dark:text-slate-100">AI Price Estimator</h2>
              <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Get accurate valuations based on real-time market data.</p>
              <div className="mt-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Aircraft Model</label>
                  <select value={estimatorForm.model} onChange={(e) => setEstimatorForm((f) => ({ ...f, model: e.target.value }))} disabled={priceLoading || estimatorModelsLoading} className="w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 transition-all duration-200 ease-out focus:border-accent focus:ring-2 focus:ring-accent/25 hover:border-slate-300 dark:hover:border-slate-500 disabled:opacity-60">
                    <option value="">Select aircraft model (with sales data)</option>
                    {(estimatorModels?.length ? estimatorModels : aircraftModels).map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                  {samplePriceRequest && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Example that returns a result: <strong>{samplePriceRequest.model}</strong> with region <strong>{samplePriceRequest.region}</strong></p>
                  )}
                  {priceTestPayloads.length > 0 && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Test values from DB (select in dropdown above): {priceTestPayloads.slice(0, 5).map((p) => p.model).join(", ")}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Year of Manufacture</label>
                  <input type="text" value={estimatorForm.year} onChange={(e) => setEstimatorForm((f) => ({ ...f, year: e.target.value }))} disabled={priceLoading} className="w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 transition-all duration-200 ease-out focus:border-accent focus:ring-2 focus:ring-accent/25 hover:border-slate-300 dark:hover:border-slate-500 disabled:opacity-60" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Flight Hours</label>
                    <input type="text" value={estimatorForm.flightHours} onChange={(e) => setEstimatorForm((f) => ({ ...f, flightHours: e.target.value }))} disabled={priceLoading} className="w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 transition-all duration-200 ease-out focus:border-accent focus:ring-2 focus:ring-accent/25 hover:border-slate-300 dark:hover:border-slate-500 disabled:opacity-60" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Flight Cycles</label>
                    <input type="text" value={estimatorForm.flightCycles} onChange={(e) => setEstimatorForm((f) => ({ ...f, flightCycles: e.target.value }))} disabled={priceLoading} className="w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 transition-all duration-200 ease-out focus:border-accent focus:ring-2 focus:ring-accent/25 hover:border-slate-300 dark:hover:border-slate-500 disabled:opacity-60" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Current Location</label>
                  <select value={estimatorForm.location} onChange={(e) => setEstimatorForm((f) => ({ ...f, location: e.target.value }))} disabled={priceLoading} className="w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 transition-all duration-200 ease-out focus:border-accent focus:ring-2 focus:ring-accent/25 hover:border-slate-300 dark:hover:border-slate-500 disabled:opacity-60">
                    <option>Global</option>
                    <option>North America</option>
                    <option>Europe</option>
                    <option>Asia Pacific</option>
                  </select>
                </div>
                <button type="button" onClick={handlePriceEstimate} disabled={priceLoading} className="w-full mt-4 rounded-lg bg-accent px-4 py-3 min-h-touch text-white text-sm font-medium transition-all duration-200 ease-out hover:bg-accent-light hover:shadow-md focus:outline-none focus:ring-2 focus:ring-accent/40 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-slate-900 active:scale-[0.98] active:bg-accent-light disabled:opacity-50 disabled:hover:bg-accent disabled:hover:shadow-none inline-flex items-center justify-center gap-2">
                  {priceLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {priceLoading ? "Calculating…" : "Calculate Estimated Value"}
                </button>
              </div>
            </div>
            <div className="p-6 bg-slate-50/50 dark:bg-slate-800/80 flex flex-col min-h-0">
              <h3 className="font-heading font-semibold text-slate-900 dark:text-slate-100 flex-shrink-0">Valuation Results</h3>
              <div className="flex-1 min-h-0 overflow-y-auto pr-2 scrollbar-ui">
              {priceLoading ? (
                <div className="mt-6 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 p-8 flex items-center justify-center gap-2">
                  <Loader2 className="w-5 h-5 animate-spin text-accent" />
                  <span className="text-slate-600 dark:text-slate-300">Calculating valuation from comparable sales…</span>
                </div>
              ) : priceResult ? (
                <>
                  {(priceResult.error || (priceResult.estimated_value_millions == null && priceResult.message)) ? (
                    <div className="mt-4 rounded-lg border border-amber-200 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-900/30 p-4">
                      <p className="text-sm text-amber-800 dark:text-amber-200">{priceResult.error || priceResult.message || "No valuation could be calculated."}</p>
                      {priceResult.message && !priceResult.error && <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">Try a different model, year, or region; or add more sales data to the database.</p>}
                    </div>
                  ) : (
                    <>
                      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                        <div className="rounded-xl bg-accent/10 dark:bg-accent/20 border border-accent/20 dark:border-accent/30 p-5 flex-1 min-w-0">
                          <p className="text-sm text-slate-600 dark:text-slate-300">Estimated Market Value</p>
                          <p className="text-3xl font-bold text-accent mt-1">
                            {priceResult.estimated_value_millions != null ? `$${priceResult.estimated_value_millions}M` : "—"}
                          </p>
                          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                            {priceResult.range_low_millions != null && priceResult.range_high_millions != null
                              ? `Range: $${priceResult.range_low_millions}M – $${priceResult.range_high_millions}M`
                              : priceResult.message || ""}
                          </p>
                        </div>
                        <button type="button" onClick={() => downloadValuationPdf(priceResult, estimatorForm)} className="text-sm font-medium text-slate-600 dark:text-slate-300 rounded-md py-1.5 px-2 transition-all duration-200 ease-out hover:text-accent hover:bg-accent/10 dark:hover:bg-accent/20 focus:outline-none focus:ring-2 focus:ring-accent/25 focus:ring-inset active:scale-[0.98] active:bg-accent/15 inline-flex items-center gap-1.5">
                          <Download className="w-4 h-4" />
                          Download PDF
                        </button>
                      </div>
                      <div className="grid grid-cols-3 gap-3 mt-4">
                        <div className="rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 p-3 text-center">
                          <p className="text-xs text-slate-500 dark:text-slate-400">Confidence</p>
                          <p className="text-lg font-semibold text-emerald-600">{priceResult.confidence_pct}%</p>
                        </div>
                        <div className="rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 p-3 text-center">
                          <p className="text-xs text-slate-500 dark:text-slate-400">Market Demand</p>
                          <p className="text-lg font-semibold text-accent">{priceResult.market_demand}</p>
                        </div>
                        <div className="rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 p-3 text-center">
                          <p className="text-xs text-slate-500 dark:text-slate-400">Time to Sale</p>
                          <p className="text-lg font-semibold text-slate-700 dark:text-slate-200">{priceResult.time_to_sale_days != null ? `${priceResult.time_to_sale_days} days` : "—"}</p>
                        </div>
                      </div>
                      {priceResult.breakdown && priceResult.breakdown.length > 0 && (
                        <>
                          <h3 className="font-heading font-semibold text-slate-900 dark:text-slate-100 mt-6 mb-3">Value Breakdown</h3>
                          <ul className="space-y-2 border border-slate-200 dark:border-slate-600 rounded-lg overflow-hidden bg-white dark:bg-slate-800">
                            {priceResult.breakdown.map((row, i) => (
                              <li key={i} className="flex justify-between items-center px-4 py-2 border-b border-slate-100 dark:border-slate-600 last:border-0">
                                <span className="text-sm text-slate-700 dark:text-slate-300">{row.label}</span>
                                <span className="text-sm font-medium text-slate-900 dark:text-slate-100">{row.value_millions != null ? `$${row.value_millions}M` : ""}</span>
                              </li>
                            ))}
                            <li className="flex justify-between items-center px-4 py-3 bg-accent/10 dark:bg-accent/20 border-t-2 border-accent/20 dark:border-accent/30">
                              <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">Total Estimated Value</span>
                              <span className="text-sm font-bold text-accent">{priceResult.estimated_value_millions != null ? `$${priceResult.estimated_value_millions}M` : "—"}</span>
                            </li>
                          </ul>
                        </>
                      )}
                      {priceResult.aviacost_reference && (() => {
                        const av = priceResult.aviacost_reference as AviacostReference;
                        return (
                          <div className="mt-6 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50/50 dark:bg-slate-800/80 p-4">
                            <h3 className="font-heading font-semibold text-slate-900 dark:text-slate-100 mb-3">Operating cost reference (Aviacost)</h3>
                            <div className="grid grid-cols-2 gap-2 text-sm text-slate-700 dark:text-slate-300">
                              {av.variable_cost_per_hour != null && <p><span className="text-slate-500 dark:text-slate-400">Variable cost/hr:</span> ${av.variable_cost_per_hour.toLocaleString()}</p>}
                              {av.average_pre_owned_price != null && <p><span className="text-slate-500 dark:text-slate-400">Avg pre-owned:</span> ${(av.average_pre_owned_price / 1_000_000).toFixed(2)}M</p>}
                              {av.fuel_gallons_per_hour != null && <p><span className="text-slate-500 dark:text-slate-400">Fuel:</span> {av.fuel_gallons_per_hour} gal/hr</p>}
                              {av.normal_cruise_speed_kts != null && <p><span className="text-slate-500 dark:text-slate-400">Cruise:</span> {av.normal_cruise_speed_kts} kts</p>}
                              {av.name && <p className="col-span-2 text-xs text-slate-500 dark:text-slate-400">{av.name}</p>}
                            </div>
                          </div>
                        );
                      })()}
                      {priceResult.aircraftpost_fleet_reference && (() => {
                        const ap = priceResult.aircraftpost_fleet_reference as { matches: AircraftpostFleetAircraftRow[]; fleet_summary: any };
                        const s = ap?.fleet_summary || {};
                        const fmtNum = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v).toLocaleString() : v == null ? "—" : String(v));
                        const fmtPct = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? `${Math.round(v * 100)}%` : "—");
                        const hours = s.airframe_hours || {};
                        const land = s.total_landings || {};
                        return (
                          <div className="mt-4 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 p-4">
                            <h3 className="font-heading font-semibold text-slate-900 dark:text-slate-100 mb-2">AircraftPost fleet reference</h3>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">Fleet context from AircraftPost (matched by make/model name).</p>
                            <div className="grid grid-cols-2 gap-2 text-sm text-slate-700 dark:text-slate-300">
                              <p><span className="text-slate-500 dark:text-slate-400">Records:</span> {fmtNum(s.total_records)}</p>
                              <p><span className="text-slate-500 dark:text-slate-400">For sale rate:</span> {fmtPct(s.for_sale_rate)}</p>
                              <p className="col-span-2 text-xs text-slate-500 dark:text-slate-400">
                                <span className="text-slate-500 dark:text-slate-400">Top bases:</span>{" "}
                                {Array.isArray(s.top_bases) && s.top_bases.length > 0 ? s.top_bases.map((b: any) => `${b.base_code ?? "—"} (${b.n})`).join(", ") : "—"}
                              </p>
                              <p className="col-span-2 text-xs text-slate-500 dark:text-slate-400">
                                <span className="text-slate-500 dark:text-slate-400">Top countries:</span>{" "}
                                {Array.isArray(s.top_countries) && s.top_countries.length > 0 ? s.top_countries.map((c: any) => `${c.country_code ?? "—"} (${c.n})`).join(", ") : "—"}
                              </p>
                            </div>
                            <div className="mt-3 grid grid-cols-2 gap-3">
                              <div className="rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-600 p-3">
                                <p className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Airframe hours</p>
                                <p className="text-xs text-slate-600 dark:text-slate-300">P10: {fmtNum(hours.p10)} · P50: {fmtNum(hours.p50)} · P90: {fmtNum(hours.p90)}</p>
                              </div>
                              <div className="rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-600 p-3">
                                <p className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Total landings</p>
                                <p className="text-xs text-slate-600 dark:text-slate-300">P10: {fmtNum(land.p10)} · P50: {fmtNum(land.p50)} · P90: {fmtNum(land.p90)}</p>
                              </div>
                            </div>
                            {Array.isArray(ap.matches) && ap.matches.length > 0 && (
                              <div className="mt-3">
                                <p className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-2">Sample fleet records</p>
                                <ul className="space-y-2">
                                  {ap.matches.slice(0, 3).map((r: AircraftpostFleetAircraftRow, i: number) => (
                                    <li key={r.id || i} className="rounded-lg border border-slate-200 dark:border-slate-600 p-3 text-sm">
                                      <p className="font-medium text-slate-800 dark:text-slate-200">{r.make_model_name || "—"} {r.mfr_year != null ? `· ${r.mfr_year}` : ""}</p>
                                      <p className="text-xs text-slate-600 dark:text-slate-300">
                                        Serial: {r.serial_number ?? "—"} · Reg: {r.registration_number ?? "—"} · Base: {r.base_code ?? "—"} · Country: {r.country_code ?? "—"}
                                      </p>
                                      <p className="text-xs text-slate-600 dark:text-slate-300">
                                        Hours: {r.airframe_hours ?? "—"} · Landings: {r.total_landings ?? "—"} · Prior owners: {r.prior_owners ?? "—"}
                                      </p>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {s.note && <p className="text-xs text-slate-500 dark:text-slate-400 mt-3">{s.note}</p>}
                          </div>
                        );
                      })()}
                      {priceResult.message && !priceResult.error && <p className="text-xs text-slate-500 dark:text-slate-400 mt-3">{priceResult.message}</p>}
                    </>
                  )}
                </>
              ) : (
                <div className="mt-6 rounded-lg border border-dashed border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 p-6 text-center text-slate-500 dark:text-slate-400 text-sm">
                  Enter aircraft details and click &quot;Calculate Estimated Value&quot; for a valuation.
                </div>
              )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (activeTab === "resale") {
    return (
      <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 scrollbar-ui bg-white dark:bg-slate-900">
        <div className="max-w-4xl mx-auto">
          <div className="rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-sm p-4 sm:p-6 transition-colors duration-200">
            <h2 className="font-heading text-lg sm:text-xl font-semibold text-slate-800 dark:text-slate-100">Resale Advisory Dashboard</h2>
            <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Strategic insights for optimal aircraft resale timing and positioning.</p>
            <div className="mt-6">
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-2">Get plain-English resale guidance</h3>
              <div className="flex gap-2">
                <input type="text" value={resaleQuery} onChange={(e) => setResaleQuery(e.target.value)} placeholder="e.g. Phenom 300 2017, 1,500 hours, U.S." disabled={resaleLoading} className="flex-1 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-800 dark:text-slate-200 transition-all duration-200 ease-out focus:border-accent/50 focus:ring-2 focus:ring-accent/25 hover:border-slate-300 dark:hover:border-slate-500 disabled:opacity-60" />
                <button type="button" onClick={handleResaleAdvisory} disabled={resaleLoading || !resaleQuery.trim()} className="rounded-lg bg-accent px-4 py-3 min-h-touch flex items-center justify-center text-white text-sm font-medium transition-all duration-200 ease-out hover:bg-accent-light hover:shadow-md focus:outline-none focus:ring-2 focus:ring-accent/40 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-slate-900 active:scale-[0.98] active:bg-accent-light disabled:opacity-50 disabled:hover:bg-accent disabled:hover:shadow-none inline-flex items-center gap-2">
                  {resaleLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {resaleLoading ? "Loading…" : "Get insight"}
                </button>
              </div>
              {resaleLoading && (
                <div className="mt-3 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50/50 dark:bg-slate-800/80 p-4 flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                  <Loader2 className="w-4 h-4 animate-spin text-accent flex-shrink-0" />
                  Drafting your resale advisory brief…
                </div>
              )}
              {resaleResult && !resaleLoading && (
                <div className="mt-3">
                  <div className="flex items-center justify-end gap-2 mb-2">
                    <button
                      type="button"
                      onClick={() => downloadResalePdf(resaleQuery, resaleResult)}
                      className="text-sm font-medium text-slate-600 dark:text-slate-300 rounded-md py-1.5 px-2 transition-all duration-200 ease-out hover:text-accent hover:bg-accent/10 dark:hover:bg-accent/20 focus:outline-none focus:ring-2 focus:ring-accent/25 focus:ring-inset active:scale-[0.98] inline-flex items-center gap-1.5"
                    >
                      <Download className="w-4 h-4" />
                      Download PDF
                    </button>
                  </div>
                  <div className="rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 p-4 text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                    {resaleResult.insight}
{resaleResult.sources && Array.isArray(resaleResult.sources) && resaleResult.sources.length > 0 && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-3 italic">{resaleResult.sources.length === 1 ? "Based on 1 external source." : `Based on ${resaleResult.sources.length} external sources.`}</p>
                  )}
                  </div>
                </div>
              )}
              {resaleResult?.error && !resaleLoading && (
                <p className="mt-3 text-sm text-red-600 dark:text-red-400">{resaleResult.error}</p>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (activeTab === "phlydata") {
    const formatPrice = (v: number | null | undefined) => (v != null ? `$${Number(v).toLocaleString()}` : "—");
    const formatDate = (d: string | null | undefined) => (d ? new Date(d).toLocaleDateString() : "—");
    // Aircraft list is loaded from the API with `q` (debounced in Dashboard); `phlydataTotal` is the server count.
    const listTotal = phlydataTotal ?? 0;
    return (
      <div className="flex flex-1 min-h-0 overflow-hidden bg-white dark:bg-slate-900">
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          <div className="flex-shrink-0 px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-accent flex items-center justify-center text-white">
                <Database className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-heading font-semibold text-slate-900 dark:text-slate-100">PhlyData Aircraft</h2>
              </div>
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-auto p-4 flex flex-col gap-3">
            {phlydataError ? (
              <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-900/20 p-4 text-red-700 dark:text-red-300 text-sm">
                {phlydataError}
              </div>
            ) : null}
            {/* Search bar always visible so it doesn't disappear while loading */}
            <div className="flex flex-wrap items-center gap-3 flex-shrink-0">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search serial or registration (N-number)…"
                  value={phlydataSearch}
                  onChange={(e) => {
                    setPhlydataSearch?.(e.target.value);
                    setPhlydataPage?.(1);
                  }}
                  className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
                />
              </div>
              <span className="text-sm text-slate-500 dark:text-slate-400 flex items-center gap-2">
                {phlydataLoading ? <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" /> : null}
                {phlydataLoading ? "Loading…" : `${listTotal.toLocaleString()} aircraft`}
                {phlydataSearch?.trim() ? " (search)" : " in aircraft table"}
              </span>
            </div>
            {phlydataLoading && phlydataAircraft.length === 0 ? (
              <div className="flex items-center justify-center gap-2 py-12 text-slate-500 dark:text-slate-400 flex-1">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Loading aircraft…</span>
              </div>
            ) : phlydataAircraft.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 dark:border-slate-600 bg-slate-50/50 dark:bg-slate-800/80 p-8 text-center text-slate-500 dark:text-slate-400 text-sm">
                No aircraft found. The table shows data from `phlydata_aircraft` only; run the ETL pipeline to load aircraft if empty.
              </div>
            ) : (() => {
              const sorted = [...phlydataAircraft].sort((a, b) => {
                let va: string | number = "";
                let vb: string | number = "";
                if (phlydataSortKey === "serial_number") {
                  va = (a.serial_number ?? "").toLowerCase();
                  vb = (b.serial_number ?? "").toLowerCase();
                } else if (phlydataSortKey === "registration_number") {
                  va = (a.registration_number ?? "").toLowerCase();
                  vb = (b.registration_number ?? "").toLowerCase();
                } else if (phlydataSortKey === "manufacturer_model") {
                  va = [a.manufacturer, a.model].filter(Boolean).join(" ").toLowerCase();
                  vb = [b.manufacturer, b.model].filter(Boolean).join(" ").toLowerCase();
                } else if (phlydataSortKey === "manufacturer_year") {
                  va = a.manufacturer_year ?? a.delivery_year ?? 0;
                  vb = b.manufacturer_year ?? b.delivery_year ?? 0;
                } else {
                  va = (a.category ?? "").toLowerCase();
                  vb = (b.category ?? "").toLowerCase();
                }
                const cmp = va < vb ? -1 : va > vb ? 1 : 0;
                return phlydataSortDir === "asc" ? cmp : -cmp;
              });
                const pageSize = phlydataPageSize || 100;
                const totalPages = Math.max(1, Math.ceil(listTotal / pageSize));
                const page = Math.min(phlydataPage, totalPages);
                const pageRows = sorted;
              const handleSort = (key: typeof phlydataSortKey) => {
                if (phlydataSortKey === key) setPhlydataSortDir((d) => (d === "asc" ? "desc" : "asc"));
                else {
                  setPhlydataSortKey(key);
                  setPhlydataSortDir("asc");
                }
              };
              return (
                <div className="space-y-3 flex-1 min-h-0 flex flex-col">
                  <div className="rounded-lg border border-slate-200 dark:border-slate-600 overflow-hidden bg-white dark:bg-slate-800 shadow-sm flex-1 min-h-0 flex flex-col">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 dark:bg-slate-800/90 border-b border-slate-200 dark:border-slate-600">
                          <tr>
                            {[
                              { key: "serial_number" as const, label: "Serial" },
                              { key: "registration_number" as const, label: "Registration" },
                              { key: "manufacturer_model" as const, label: "Manufacturer / Model" },
                              { key: "manufacturer_year" as const, label: "Year" },
                              { key: "category" as const, label: "Category" },
                            ].map(({ key, label }) => (
                              <th
                                key={key}
                                className="text-left py-3 px-4 font-medium text-slate-700 dark:text-slate-200 cursor-pointer select-none hover:bg-slate-100 dark:hover:bg-slate-700/50"
                                onClick={() => handleSort(key)}
                              >
                                <span className="inline-flex items-center gap-1">
                                  {label}
                                  {phlydataSortKey === key ? (phlydataSortDir === "asc" ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />) : null}
                                </span>
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {pageRows.map((row) => (
                            <tr
                              key={row.id}
                              onClick={() =>
                                row.serial_number &&
                                onPhlydataRowClick?.(
                                  row.serial_number,
                                  row.manufacturer,
                                  row.model,
                                  row.registration_number
                                )
                              }
                              className="border-b border-slate-100 dark:border-slate-700 hover:bg-accent/10 dark:hover:bg-accent/15 cursor-pointer transition-colors"
                            >
                              <td className="py-3 px-4 font-mono text-slate-800 dark:text-slate-200">{row.serial_number ?? "—"}</td>
                              <td className="py-3 px-4 text-slate-700 dark:text-slate-300">{row.registration_number ?? "—"}</td>
                              <td className="py-3 px-4 text-slate-700 dark:text-slate-300">{[row.manufacturer, row.model].filter(Boolean).join(" ") || "—"}</td>
                              <td className="py-3 px-4 text-slate-700 dark:text-slate-300">{row.manufacturer_year ?? row.delivery_year ?? "—"}</td>
                              <td className="py-3 px-4 text-slate-600 dark:text-slate-400">{row.category ?? "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-4 py-2 flex-wrap">
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      {totalPages > 1 ? `Page ${page} of ${totalPages}` : ""} ({listTotal.toLocaleString()} total)
                    </p>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-slate-500 dark:text-slate-400">Per page:</span>
                      <select
                        value={phlydataPageSize || 100}
                        onChange={(e) => {
                          const size = Number(e.target.value);
                          setPhlydataPageSize?.(size);
                          setPhlydataPage?.(1);
                        }}
                        className="text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-2 py-1.5 focus:ring-2 focus:ring-accent/50 focus:border-accent"
                        aria-label="Rows per page"
                      >
                        {[25, 50, 100].map((n) => (
                          <option key={n} value={n}>{n}</option>
                        ))}
                      </select>
                      {totalPages > 1 && (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setPhlydataPage?.(Math.max(1, page - 1))}
                            disabled={page <= 1}
                            className="p-2 rounded-lg border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-700"
                            aria-label="Previous page"
                          >
                            <ChevronLeft className="w-5 h-5" />
                          </button>
                          <span className="px-2 text-sm text-slate-600 dark:text-slate-400">Page {page}</span>
                          <button
                            type="button"
                            onClick={() => setPhlydataPage?.(Math.min(totalPages, page + 1))}
                            disabled={page >= totalPages}
                            className="p-2 rounded-lg border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-700"
                            aria-label="Next page"
                          >
                            <ChevronRight className="w-5 h-5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
        {/* Owner detail panel (slide-over) */}
        {(phlydataOwnerDetail || phlydataDetailLoading) && (
          <div className="w-full lg:w-[420px] flex-shrink-0 border-l border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex flex-col overflow-hidden shadow-lg">
            <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700">
              <h3 className="font-heading font-semibold text-slate-900 dark:text-slate-100">Owner details</h3>
              <button type="button" onClick={onPhlydataCloseDetail} aria-label="Close" className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 dark:text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-6">
              {phlydataDetailLoading ? (
                <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 py-8">
                  <Loader2 className="w-5 h-5 animate-spin flex-shrink-0" />
                  <span>Loading owner details…</span>
                </div>
              ) : phlydataOwnerDetail?.message && !phlydataOwnerDetail.aircraft ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">{phlydataOwnerDetail.message}</p>
              ) : phlydataOwnerDetail?.aircraft ? (
                <>
                  <section>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2 flex items-center gap-2">
                      <Database className="w-4 h-4" /> Aircraft
                    </h4>
                    <div className="rounded-lg bg-slate-50 dark:bg-slate-800/80 p-3 text-sm space-y-1">
                      <p><span className="text-slate-500 dark:text-slate-400">Serial:</span> {phlydataOwnerDetail.aircraft.serial_number ?? "—"}</p>
                      <p><span className="text-slate-500 dark:text-slate-400">Registration:</span> {phlydataOwnerDetail.aircraft.registration_number ?? "—"}</p>
                      <p><span className="text-slate-500 dark:text-slate-400">Make/Model:</span> {[phlydataOwnerDetail.aircraft.manufacturer, phlydataOwnerDetail.aircraft.model].filter(Boolean).join(" ") || "—"}</p>
                      <p><span className="text-slate-500 dark:text-slate-400">Year:</span> {phlydataOwnerDetail.aircraft.manufacturer_year ?? phlydataOwnerDetail.aircraft.delivery_year ?? "—"}</p>
                      {phlydataOwnerDetail.owner_lookup_sources && phlydataOwnerDetail.owner_lookup_sources.length > 0 ? (
                        <p className="text-xs text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-200 dark:border-slate-600 mt-2">
                          Owner lookup sources:{" "}
                          {phlydataOwnerDetail.owner_lookup_sources.map((s) => (s === "faa" ? "FAA MASTER" : s)).join(" · ")}
                          {phlydataOwnerDetail.faa_master_match_kind === "n_number_serial" ? (
                            <span className="block mt-0.5 text-slate-600 dark:text-slate-300">
                              FAA MASTER match: registration (N-number) + serial
                            </span>
                          ) : phlydataOwnerDetail.faa_master_match_kind === "n_number_only" ? (
                            <span className="block mt-0.5 text-amber-700 dark:text-amber-300">
                              FAA MASTER match: registration (N-number) only — FAA serial on file did not match PhlyData serial; owner is for this tail.
                            </span>
                          ) : phlydataOwnerDetail.faa_master_match_kind === "serial_model" ? (
                            <span className="block mt-0.5 text-amber-700 dark:text-amber-300">
                              FAA MASTER match: serial + model code (no registration row, or tail+serial mismatch)
                            </span>
                          ) : phlydataOwnerDetail.faa_master_match_kind === "serial_only" ? (
                            <span className="block mt-0.5 text-amber-700 dark:text-amber-300">
                              FAA MASTER match: serial only (no model filter)
                            </span>
                          ) : null}
                        </p>
                      ) : null}
                    </div>
                  </section>
                  {(phlydataOwnerDetail.zoominfo_enrichment?.length ?? 0) >= 0 && (
                    <section>
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2 flex items-center gap-2">
                        <Building2 className="w-4 h-4" /> Owner details (ZoomInfo)
                      </h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mb-3 leading-relaxed">
                        Company enrichment from ZoomInfo when available. Official registrant data appears in the FAA section below.
                      </p>
                      {phlydataOwnerDetail.zoominfo_enrichment && phlydataOwnerDetail.zoominfo_enrichment.filter((item: ZoominfoEnrichmentItem) => (item.companies?.length ?? 0) > 0 || (item.contacts?.length ?? 0) > 0 || (item.zoominfo_error ?? null) != null).length > 0 ? (
                      <ul className="space-y-4">
                        {phlydataOwnerDetail.zoominfo_enrichment.filter((item: ZoominfoEnrichmentItem) => (item.companies?.length ?? 0) > 0 || (item.contacts?.length ?? 0) > 0 || (item.zoominfo_error ?? null) != null).map((item: ZoominfoEnrichmentItem, idx: number) => {
                          const sourceLabel =
                            item.source_platform === "controller"
                              ? "Controller (Seller Name)"
                              : item.source_platform === "aircraftexchange"
                                ? "AircraftExchange (dealer_name)"
                                : item.source_platform === "faa"
                                  ? "FAA (registrant_name)"
                                  : item.source_platform === "faa_trustee_hint"
                                    ? "FAA (legacy)"
                                    : item.source_platform === "faa_tavily_llm_hint"
                                      ? "FAA (Tavily + AI → company)"
                                      : item.source_platform || "Listing";
                          const matched: ZoominfoMatched = item.matched || {};
                          const matchMethod: ZoominfoMatchMethod | undefined = item.match_method;
                          const matchMethodLabel = matchMethod === "phone" ? "Phone" : matchMethod === "content_score" ? "Content match" : matchMethod === "llm_fallback" ? "AI (vector+LLM)" : null;
                          const bestCompany = item.companies?.[0];
                          const bestContact = item.contacts?.[0];
                          const hasError = Boolean(item.zoominfo_error);
                          return (
                          <li
                            key={idx}
                            className={
                              hasError
                                ? "rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/70 p-3 text-sm space-y-2 border-l-4 border-l-slate-300 dark:border-l-slate-500"
                                : "rounded-lg border border-accent/20 dark:border-accent/30 bg-accent/[0.04] dark:bg-accent/10 p-3 text-sm space-y-2 ring-1 ring-inset ring-slate-200/60 dark:ring-slate-600/40"
                            }
                          >
                            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{sourceLabel}: “{item.query_name}”{matchMethodLabel != null && <span className="text-slate-400"> · Matched by: {matchMethodLabel}</span>}</p>
                            {item.zoominfo_error ? (
                              <p className="text-sm text-slate-600 dark:text-slate-300">
                                {item.needs_contacts_admin_permission ? (
                                  <>
                                    Person name detected. ZoomInfo admin permission is required to show email/phone.
                                  </>
                                ) : (
                                  "No ZoomInfo profile found for this registrant."
                                )}
                              </p>
                            ) : (
                              <>
                                <div className="flex flex-wrap gap-1.5 mb-2">
                                  {matched.company && <span className="inline-flex items-center gap-1 rounded-md bg-accent/15 dark:bg-accent/25 px-2 py-0.5 text-xs font-medium text-accent">Company</span>}
                                  {matched.person && <span className="inline-flex items-center gap-1 rounded-md bg-slate-200/90 dark:bg-slate-600/50 px-2 py-0.5 text-xs font-medium text-slate-800 dark:text-slate-100">Person</span>}
                                  {matched.phone && <span className="inline-flex items-center gap-1 rounded-md bg-accent/10 dark:bg-accent/15 px-2 py-0.5 text-xs font-medium text-slate-800 dark:text-slate-100 ring-1 ring-accent/25">Phone</span>}
                                  {matched.location && <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 dark:bg-slate-700/60 px-2 py-0.5 text-xs font-medium text-slate-700 dark:text-slate-200">Location</span>}
                                  {matched.llm_fallback && <span className="inline-flex items-center gap-1 rounded-md bg-slate-200/80 dark:bg-slate-600/40 px-2 py-0.5 text-xs font-medium text-slate-800 dark:text-slate-200">AI match</span>}
                                  {matched.website && <span className="inline-flex items-center gap-1 rounded-md bg-accent/12 dark:bg-accent/20 px-2 py-0.5 text-xs font-medium text-slate-800 dark:text-slate-100">Website / URL</span>}
                                </div>
                                {bestCompany && (
                                  <div className="pl-2 border-l-2 border-accent/50 dark:border-accent/40 space-y-1">
                                    {(() => {
                                      const attrs = bestCompany.attributes || {};
                                      const name = ((attrs.name as string) || (attrs.companyName as string) || bestCompany.id || "").trim();
                                      const website = (attrs.website as string)?.trim();
                                      const street = (attrs.street as string)?.trim() || (attrs.addressLine1 as string)?.trim() || (attrs.address as string)?.trim();
                                      const city = (attrs.city as string)?.trim();
                                      const state = (attrs.state as string)?.trim();
                                      const zipCode = (attrs.zipCode as string)?.trim();
                                      const country = (attrs.country as string)?.trim();
                                      const phone = (attrs.phone ?? attrs.directPhone ?? attrs.mainPhone) as string | undefined;
                                      const ticker = (attrs.ticker as string)?.trim();
                                      const socialUrls = attrs.socialMediaUrls as Array<{ type?: string; url?: string; followerCount?: string }> | undefined;
                                      const revenue = attrs.revenue as number | undefined;
                                      const employeeCount = attrs.employeeCount != null ? Number(attrs.employeeCount) : null;
                                      const employeeRange = (attrs.employeeRange as string)?.trim();
                                      const employeesText = employeeCount != null && employeeRange
                                        ? `${employeeCount} (${employeeRange})`
                                        : employeeCount != null
                                          ? String(employeeCount)
                                          : employeeRange || "";
                                      const industries = attrs.industries as string[] | undefined;
                                      const foundedYear = attrs.foundedYear != null ? String(attrs.foundedYear).trim() : "";
                                      const companyStatus = (attrs.companyStatus as string)?.trim();
                                      const certified = attrs.certified;
                                      const continent = (attrs.continent as string)?.trim();
                                      const locationCount = attrs.locationCount != null ? Number(attrs.locationCount) : null;
                                      const numberOfContactsInZoomInfo = attrs.numberOfContactsInZoomInfo != null ? Number(attrs.numberOfContactsInZoomInfo) : null;
                                      const parentId = attrs.parentId != null && attrs.parentId !== 0 ? String(attrs.parentId) : null;
                                      const parentName = (attrs.parentName as string)?.trim();
                                      const hasName = name && name !== "—";
                                      return (
                                        <>
                                          {hasName && <p className="font-medium text-slate-800 dark:text-slate-200 flex items-center gap-1.5"><Building2 className="w-4 h-4 flex-shrink-0" /> {name}</p>}
                                          {ticker && <p className="text-slate-600 dark:text-slate-300"><span className="text-slate-500 dark:text-slate-400">Ticker:</span> {ticker}</p>}
                                          {website && <p className="text-slate-600 dark:text-slate-300"><span className="text-slate-500 dark:text-slate-400">Website:</span> <a href={website.startsWith("http") ? website : `https://${website}`} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">{website}</a></p>}
                                          {phone && <p className="text-slate-600 dark:text-slate-300"><span className="text-slate-500 dark:text-slate-400">Phone:</span> {phone}</p>}
                                          {Array.isArray(socialUrls) && socialUrls.length > 0 && socialUrls.some((s) => s?.url) && (
                                            <div className="text-slate-600 dark:text-slate-300 text-xs space-y-0.5">
                                              <span className="text-slate-500 dark:text-slate-400">Social:</span>
                                              {socialUrls.filter((s) => s?.url).map((s, i) => {
                                                const label = (s.type === "LINKED_IN" ? "LinkedIn" : s.type === "TWITTER" ? "Twitter/X" : s.type === "FACEBOOK" ? "Facebook" : s.type || "Link") as string;
                                                return (
                                                  <p key={i} className="pl-0">
                                                    <a href={s.url!.startsWith("http") ? s.url : `https://${s.url}`} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">{label}</a>
                                                    {s.followerCount ? ` (${Number(s.followerCount).toLocaleString()} followers)` : ""}
                                                  </p>
                                                );
                                              })}
                                            </div>
                                          )}
                                          {street && <p className="text-slate-600 dark:text-slate-300 flex items-start gap-1.5"><MapPin className="w-4 h-4 flex-shrink-0 mt-0.5" /><span><span className="text-slate-500 dark:text-slate-400">Street:</span> {street}</span></p>}
                                          {city && <p className="text-slate-600 dark:text-slate-300"><span className="text-slate-500 dark:text-slate-400">City:</span> {city}</p>}
                                          {state && <p className="text-slate-600 dark:text-slate-300"><span className="text-slate-500 dark:text-slate-400">State:</span> {state}</p>}
                                          {zipCode && <p className="text-slate-600 dark:text-slate-300"><span className="text-slate-500 dark:text-slate-400">Zip:</span> {zipCode}</p>}
                                          {country && <p className="text-slate-600 dark:text-slate-300"><span className="text-slate-500 dark:text-slate-400">Country:</span> {country}</p>}
                                          {revenue != null && <p className="text-slate-600 dark:text-slate-300 text-xs"><span className="text-slate-500 dark:text-slate-400">Revenue:</span> {typeof revenue === "number" ? revenue.toLocaleString() : revenue}</p>}
                                          {employeesText && <p className="text-slate-600 dark:text-slate-300 text-xs"><span className="text-slate-500 dark:text-slate-400">Employees:</span> {employeesText}</p>}
                                          {foundedYear && <p className="text-slate-600 dark:text-slate-300 text-xs"><span className="text-slate-500 dark:text-slate-400">Founded:</span> {foundedYear}</p>}
                                          {companyStatus && <p className="text-slate-600 dark:text-slate-300 text-xs"><span className="text-slate-500 dark:text-slate-400">Status:</span> {companyStatus}</p>}
                                          {Array.isArray(industries) && industries.length > 0 && (
                                            <p className="text-slate-600 dark:text-slate-300 text-xs"><span className="text-slate-500 dark:text-slate-400">Industries:</span> {industries.filter(Boolean).join(", ")}</p>
                                          )}
                                          {certified === true && <p className="text-slate-600 dark:text-slate-300 text-xs"><span className="text-slate-500 dark:text-slate-400">Certified:</span> Yes</p>}
                                          {continent && <p className="text-slate-600 dark:text-slate-300 text-xs"><span className="text-slate-500 dark:text-slate-400">Continent:</span> {continent}</p>}
                                          {locationCount != null && <p className="text-slate-600 dark:text-slate-300 text-xs"><span className="text-slate-500 dark:text-slate-400">Locations:</span> {locationCount}</p>}
                                          {numberOfContactsInZoomInfo != null && <p className="text-slate-600 dark:text-slate-300 text-xs"><span className="text-slate-500 dark:text-slate-400">Contacts in ZoomInfo:</span> {numberOfContactsInZoomInfo.toLocaleString()}</p>}
                                          {parentName && <p className="text-slate-600 dark:text-slate-300 text-xs"><span className="text-slate-500 dark:text-slate-400">Parent:</span> {parentName}</p>}
                                        </>
                                      );
                                    })()}
                                  </div>
                                )}
                                {bestContact && (
                                  <div className="pl-2 border-l-2 border-slate-300 dark:border-slate-600 space-y-1 mt-2">
                                    {(() => {
                                      const attrs = bestContact.attributes || {};
                                      const fullName = ((attrs.fullName as string) || [attrs.firstName, attrs.lastName].filter(Boolean).join(" ")).trim();
                                      const companyName = (attrs.companyName as string)?.trim();
                                      const phone = (attrs.phone ?? attrs.directPhone ?? attrs.mobilePhone ?? attrs.workPhone) as string | undefined;
                                      const email = (attrs.email ?? attrs.emailAddress) as string | undefined;
                                      const addressParts = [attrs.address, attrs.city, attrs.state].filter(Boolean).map(String);
                                      const address = addressParts.join(", ").trim();
                                      return (
                                        <>
                                          {fullName && <p className="font-medium text-slate-800 dark:text-slate-200 flex items-center gap-1.5"><User className="w-4 h-4 flex-shrink-0" /> {fullName}</p>}
                                          {companyName && <p className="text-slate-600 dark:text-slate-300 flex items-center gap-1.5"><Building2 className="w-4 h-4 flex-shrink-0" /> {companyName}</p>}
                                          {email && <p><a href={`mailto:${email}`} className="text-accent hover:underline">{email}</a></p>}
                                          {phone && <p>{phone}</p>}
                                          {address && <p className="flex items-start gap-1.5 text-slate-600 dark:text-slate-300"><MapPin className="w-4 h-4 flex-shrink-0 mt-0.5" /> {address}</p>}
                                        </>
                                      );
                                    })()}
                                  </div>
                                )}
                              </>
                            )}
                          </li>
                          );
                        })}
                      </ul>
                      ) : (
                        <div
                          role="status"
                          className="rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50/95 dark:bg-slate-800/60 p-4 shadow-sm"
                        >
                          <div className="flex flex-col items-center justify-center text-center gap-3">
                            <p className="font-semibold text-slate-900 dark:text-slate-100 text-sm">
                              ZoomInfo profile not found
                            </p>
                            {phlydataOwnerDetail.zoominfo_registrant_type_hint === "person" ? (
                              <p className="text-xs text-slate-600 dark:text-slate-300 max-w-sm">
                                Person registrant: ZoomInfo needs admin permission to return email or phone.
                              </p>
                            ) : null}
                          </div>
                        </div>
                      )}
                    </section>
                  )}
                  {phlydataOwnerDetail.owners_from_listings.length > 0 && (
                    <section>
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2 flex items-center gap-2">
                        <Building2 className="w-4 h-4" /> From listings (Controller / AircraftExchange)
                      </h4>
                      <ul className="space-y-4">
                        {phlydataOwnerDetail.owners_from_listings.map((o: OwnerFromListing, i: number) => (
                          <li key={i} className="rounded-lg border border-slate-200 dark:border-slate-600 p-3 text-sm space-y-1.5">
                            {o.source_platform && <span className="inline-block text-xs font-medium text-accent bg-accent/10 dark:bg-accent/20 px-2 py-0.5 rounded">{o.source_platform}</span>}
                            {o.seller && <p className="font-medium text-slate-800 dark:text-slate-200 flex items-center gap-1.5"><Building2 className="w-4 h-4 flex-shrink-0" /> {o.seller}</p>}
                            {o.seller_contact_name && <p className="text-slate-700 dark:text-slate-300 flex items-center gap-1.5"><User className="w-4 h-4 flex-shrink-0" /> {o.seller_contact_name}</p>}
                            {o.seller_email && <p><a href={`mailto:${o.seller_email}`} className="text-accent hover:underline">{o.seller_email}</a></p>}
                            {o.seller_phone && <p>{o.seller_phone}</p>}
                            {o.seller_location && <p className="flex items-start gap-1.5"><MapPin className="w-4 h-4 flex-shrink-0 mt-0.5" /> {o.seller_location}</p>}
                            {o.seller_broker && <p className="text-slate-500 dark:text-slate-400">Broker: {o.seller_broker}</p>}
                            {(o.ask_price != null || o.sold_price != null) && <p className="text-slate-600 dark:text-slate-300">Ask: {formatPrice(o.ask_price)} · Sold: {formatPrice(o.sold_price)} · {formatDate(o.date_sold)}</p>}
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}
                  {phlydataOwnerDetail.owners_from_faa.length > 0 && (
                    <section>
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2 flex items-center gap-2">
                        <MapPin className="w-4 h-4" /> FAA MASTER (`faa_master`)
                      </h4>
                      <ul className="space-y-3">
                        {phlydataOwnerDetail.owners_from_faa.map((o: OwnerFromFaa, i: number) => {
                          const addr = faaAddressLines(o);
                          const hasAddress =
                            addr.street || addr.street2 || addr.cityStateZip || o.country || addr.extras.length > 0;
                          return (
                            <li
                              key={i}
                              className="rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50/90 dark:bg-slate-800/50 p-4 shadow-sm border-l-4 border-l-accent ring-1 ring-inset ring-slate-200/50 dark:ring-slate-700/50"
                            >
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-accent mb-1.5">
                                Registrant name
                              </p>
                              <p className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-3">
                                {o.registrant_name?.trim() || "—"}
                              </p>
                              {(() => {
                                const syn: FaaTavilyLlmSynthesis | null | undefined = o.tavily_llm_synthesis;
                                if (!syn || (!syn.operating_company_name && !syn.summary && !syn.error)) return null;
                                return (
                                  <div className="mb-3 rounded-lg border border-slate-200 dark:border-slate-600 bg-violet-50/40 dark:bg-violet-950/20 p-3 text-sm space-y-1.5">
                                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                      Operating company (Tavily + AI)
                                    </p>
                                    {syn.error ? (
                                      <p className="text-xs text-amber-700 dark:text-amber-400/90">{syn.error}</p>
                                    ) : null}
                                    {syn.operating_company_name ? (
                                      <p className="font-medium text-slate-800 dark:text-slate-100">{syn.operating_company_name}</p>
                                    ) : null}
                                    {syn.summary ? (
                                      <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{syn.summary}</p>
                                    ) : null}
                                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs pt-0.5">
                                      {syn.website ? (
                                        <a
                                          href={syn.website.startsWith("http") ? syn.website : `https://${syn.website}`}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-accent hover:underline"
                                        >
                                          Website (from AI)
                                        </a>
                                      ) : null}
                                      {syn.phone ? <span className="text-slate-600 dark:text-slate-300">{syn.phone}</span> : null}
                                      {syn.confidence ? (
                                        <span className="text-slate-400 dark:text-slate-500">Confidence: {syn.confidence}</span>
                                      ) : null}
                                    </div>
                                    <p className="text-[10px] text-slate-400 dark:text-slate-500 leading-snug">
                                      Medium/high confidence can trigger an extra ZoomInfo company search.
                                    </p>
                                  </div>
                                );
                              })()}
                              {(() => {
                                const tw: FaaTavilyWebHints | null | undefined = o.tavily_web_hints;
                                if (!tw || (!tw.results?.length && !tw.error)) return null;
                                return (
                                  <div className="mb-3 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-100/50 dark:bg-slate-900/40 p-3 text-sm space-y-2">
                                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                      Web search hints (Tavily)
                                    </p>
                                    {tw.disclaimer ? (
                                      <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{tw.disclaimer}</p>
                                    ) : null}
                                    {tw.query ? (
                                      <p className="text-[10px] text-slate-400 dark:text-slate-500 font-mono break-all">
                                        Query: {tw.query}
                                      </p>
                                    ) : null}
                                    {tw.error ? (
                                      <p className="text-xs text-amber-700 dark:text-amber-400/90">{tw.error}</p>
                                    ) : null}
                                    {tw.results && tw.results.length > 0 ? (
                                      <ul className="space-y-2 text-xs">
                                        {tw.results.map((hit, hi) => (
                                          <li key={hi} className="border-t border-slate-200 dark:border-slate-600 pt-2 first:border-t-0 first:pt-0">
                                            {hit.url ? (
                                              <a
                                                href={hit.url.startsWith("http") ? hit.url : `https://${hit.url}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-accent font-medium hover:underline break-all"
                                              >
                                                {hit.title || hit.url}
                                              </a>
                                            ) : (
                                              <span className="text-slate-700 dark:text-slate-200">{hit.title || "—"}</span>
                                            )}
                                            {hit.content ? (
                                              <p className="text-slate-600 dark:text-slate-300 mt-1 leading-relaxed line-clamp-4">
                                                {hit.content}
                                              </p>
                                            ) : null}
                                          </li>
                                        ))}
                                      </ul>
                                    ) : null}
                                  </div>
                                );
                              })()}
                              <div className="pt-3 border-t border-slate-200 dark:border-slate-600">
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2 flex items-center gap-1.5">
                                  <MapPin className="w-3.5 h-3.5 text-accent" aria-hidden />
                                  Mailing address
                                </p>
                                {hasAddress ? (
                                  <div className="text-sm text-slate-700 dark:text-slate-200 space-y-1.5 pl-0">
                                    {addr.street && <p className="leading-snug">{addr.street}</p>}
                                    {addr.street2 && <p className="leading-snug">{addr.street2}</p>}
                                    {addr.cityStateZip && <p className="leading-snug">{addr.cityStateZip}</p>}
                                    {o.country && o.country.trim() && (
                                      <p className="text-slate-600 dark:text-slate-300">{String(o.country).trim()}</p>
                                    )}
                                    {addr.extras.length > 0 && (
                                      <p className="text-xs text-slate-500 dark:text-slate-400 pt-1">{addr.extras.join(" · ")}</p>
                                    )}
                                  </div>
                                ) : (
                                  <p className="text-sm text-slate-500 dark:text-slate-400 italic">No address on file in this record.</p>
                                )}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </section>
                  )}
                  {phlydataOwnerDetail.owners_from_listings.length === 0 &&
                    phlydataOwnerDetail.owners_from_faa.length === 0 && (
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      No owner data found in FAA MASTER (`faa_master`) for this aircraft (check serial, registration / N-number, and model).
                    </p>
                  )}
                </>
              ) : null}
            </div>
          </div>
        )}
      </div>
    );
  }

  return null;
}
