"use client";

import React, { useState, useEffect } from "react";
import { MessageCircle, BarChart3, Calculator, Users, Database } from "lucide-react";
import ChatSidebar from "./ChatSidebar";
import DashboardLayout from "./DashboardLayout";
import DashboardCenterContent from "./DashboardCenterContent";
import { postMarketComparison, postPriceEstimate, postResaleAdvisory, getAircraftModels, getPriceEstimateModels, getPhlydataAircraft, getPhlydataOwners } from "@/lib/api";
import type { MarketComparisonResponse, PriceEstimateResponse, ResaleAdvisoryResponse, PhlydataAircraftRow, PhlydataOwnersResponse } from "@/lib/api";


type TabId = "consultant" | "comparison" | "estimator" | "resale" | "phlydata";

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: "consultant", label: "Ask Consultant", icon: <MessageCircle className="w-5 h-5 flex-shrink-0" /> },
  { id: "comparison", label: "Market Comparison", icon: <BarChart3 className="w-5 h-5 flex-shrink-0" /> },
  { id: "estimator", label: "Price Estimator", icon: <Calculator className="w-5 h-5 flex-shrink-0" /> },
  { id: "resale", label: "Resale Advisory", icon: <Users className="w-5 h-5 flex-shrink-0" /> },
  { id: "phlydata", label: "PhlyData Aircraft", icon: <Database className="w-5 h-5 flex-shrink-0" /> },
];
// Hide Market Comparison from nav (tab and logic remain in code)
const TABS_VISIBLE = TABS.filter((t) => t.id !== "comparison");

const VALUE_BREAKDOWN = [
  { label: "Base Aircraft Value", value: "$38.5M", positive: false },
  { label: "Low Flight Hours Premium", value: "+$2.8M", positive: true },
  { label: "Maintenance Status Adjustment", value: "+$1.5M", positive: true },
  { label: "Market Demand Factor", value: "+$0.5M", positive: true },
  { label: "Regional Adjustment", value: "-$1.0M", positive: false },
];

type DashboardProps = {
  isAuthenticated: boolean;
};

const MAX_RECENT_QUERIES = 10;

export default function Dashboard({ isAuthenticated }: DashboardProps) {
  const [activeTab, setActiveTab] = useState<TabId>("consultant");
  const [recentQueries, setRecentQueries] = useState<string[]>([]);
  const [suggestedQuery, setSuggestedQuery] = useState<string | null>(null);
  const [selectedModels, setSelectedModels] = useState<Set<string>>(new Set());
  const [region, setRegion] = useState("Global");
  const [timePeriod, setTimePeriod] = useState("Last 30 Days");
  const [comparisonFilters, setComparisonFilters] = useState<{ maxHours: string; minYear: string; maxYear: string }>({ maxHours: "", minYear: "", maxYear: "" });
  const [metrics, setMetrics] = useState({ marketValue: true, priceTrends: true, transactionVolume: false, daysOnMarket: true });
  const [estimatorForm, setEstimatorForm] = useState({ model: "", year: "2015", flightHours: "45000", flightCycles: "28000", location: "North America" });

  const [comparisonResult, setComparisonResult] = useState<MarketComparisonResponse | null>(null);
  const [comparisonLoading, setComparisonLoading] = useState(false);
  const [comparisonError, setComparisonError] = useState<string | null>(null);

  const [priceResult, setPriceResult] = useState<PriceEstimateResponse | null>(null);
  const [priceLoading, setPriceLoading] = useState(false);

  const [resaleQuery, setResaleQuery] = useState("");
  const [resaleResult, setResaleResult] = useState<ResaleAdvisoryResponse | null>(null);
  const [resaleLoading, setResaleLoading] = useState(false);

  const [aircraftModels, setAircraftModels] = useState<string[]>([]);
  const [aircraftModelsLoading, setAircraftModelsLoading] = useState(true);
  const [aircraftModelsError, setAircraftModelsError] = useState<string | null>(null);

  const [estimatorModels, setEstimatorModels] = useState<string[]>([]);
  const [estimatorModelsLoading, setEstimatorModelsLoading] = useState(true);
  const [samplePriceRequest, setSamplePriceRequest] = useState<{ model: string; region: string } | null>(null);
  const [priceTestPayloads, setPriceTestPayloads] = useState<Array<{ model: string; region: string }>>([]);

  const [phlydataAircraft, setPhlydataAircraft] = useState<PhlydataAircraftRow[]>([]);
  const [phlydataTotal, setPhlydataTotal] = useState(0);
  const [phlydataPage, setPhlydataPage] = useState(1);
  const [phlydataPageSize, setPhlydataPageSize] = useState(100);
  const [phlydataSearch, setPhlydataSearch] = useState("");
  /** Debounced query sent to FastAPI `GET .../api/phlydata/aircraft?q=` on each search. */
  const [phlydataSearchDebounced, setPhlydataSearchDebounced] = useState("");
  const [phlydataLoading, setPhlydataLoading] = useState(false);
  const [phlydataError, setPhlydataError] = useState<string | null>(null);
  const [phlydataOwnerDetail, setPhlydataOwnerDetail] = useState<PhlydataOwnersResponse | null>(null);
  const [phlydataDetailLoading, setPhlydataDetailLoading] = useState(false);

  // When Market Comparison is hidden, avoid showing it as active tab
  useEffect(() => {
    if (activeTab === "comparison") setActiveTab("consultant");
  }, [activeTab]);

  // Debounce search input → backend `q` (avoids a request on every keystroke).
  useEffect(() => {
    const t = window.setTimeout(() => setPhlydataSearchDebounced(phlydataSearch.trim()), 350);
    return () => window.clearTimeout(t);
  }, [phlydataSearch]);

  // PhlyData aircraft list: server pagination + search (`q`). Refetch when tab, page, page size, or debounced query changes.
  useEffect(() => {
    if (activeTab !== "phlydata") return;
    let cancelled = false;
    setPhlydataLoading(true);
    setPhlydataError(null);
    const q = phlydataSearchDebounced || undefined;
    getPhlydataAircraft({
      page: phlydataPage,
      page_size: phlydataPageSize,
      q,
    })
      .then((data) => {
        if (!cancelled) {
          const total = data.total ?? 0;
          const maxPage = Math.max(1, Math.ceil(total / phlydataPageSize) || 1);
          if (phlydataPage > maxPage) {
            setPhlydataPage(maxPage);
            setPhlydataTotal(total);
            setPhlydataAircraft([]);
            return;
          }
          setPhlydataAircraft(data.aircraft || []);
          setPhlydataTotal(total);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setPhlydataError(e instanceof Error ? e.message : "Failed to load PhlyData aircraft");
          setPhlydataAircraft([]);
          setPhlydataTotal(0);
        }
      })
      .finally(() => {
        if (!cancelled) setPhlydataLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeTab, phlydataPage, phlydataPageSize, phlydataSearchDebounced]);

  const handlePhlydataRowClick = (
    serial: string,
    manufacturer?: string | null,
    model?: string | null,
    registration?: string | null
  ) => {
    if (!serial) {
      setPhlydataOwnerDetail(null);
      return;
    }
    setPhlydataOwnerDetail(null);
    setPhlydataDetailLoading(true);
    getPhlydataOwners(serial, manufacturer, model, registration)
      .then((data) => setPhlydataOwnerDetail(data))
      .catch(() => setPhlydataOwnerDetail({ aircraft: null, owners_from_listings: [], owners_from_faa: [], zoominfo_enrichment: [], message: "Failed to load owner details." }))
      .finally(() => setPhlydataDetailLoading(false));
  };

  useEffect(() => {
    let cancelled = false;
    setAircraftModelsLoading(true);
    setAircraftModelsError(null);
    getAircraftModels()
      .then((data) => {
        if (!cancelled) setAircraftModels(data.models || []);
      })
      .catch((e) => {
        if (!cancelled) {
          setAircraftModelsError(e instanceof Error ? e.message : "Failed to load models");
          setAircraftModels([]);
        }
      })
      .finally(() => {
        if (!cancelled) setAircraftModelsLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  // Price Estimator: load models from aircraft_sales so dropdown options match DB and return results
  useEffect(() => {
    let cancelled = false;
    setEstimatorModelsLoading(true);
    getPriceEstimateModels()
      .then((data) => {
        if (!cancelled) {
          setEstimatorModels(data.models || []);
          setSamplePriceRequest(data.sample_request ?? null);
        }
      })
      .catch(() => {
        if (!cancelled) setEstimatorModels([]);
      })
      .finally(() => {
        if (!cancelled) setEstimatorModelsLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const toggleModel = (model: string) => {
    setSelectedModels((prev) => {
      const next = new Set(prev);
      if (next.has(model)) next.delete(model);
      else next.add(model);
      return next;
    });
  };

  const handleGenerateComparison = async () => {
    const models = Array.from(selectedModels);
    if (models.length < 1) return;
    setComparisonLoading(true);
    setComparisonError(null);
    setComparisonResult(null);
    try {
      const maxHours = comparisonFilters.maxHours.trim() ? parseFloat(comparisonFilters.maxHours) : undefined;
      const minYear = comparisonFilters.minYear.trim() ? parseInt(comparisonFilters.minYear, 10) : undefined;
      const maxYear = comparisonFilters.maxYear.trim() ? parseInt(comparisonFilters.maxYear, 10) : undefined;
      const res = await postMarketComparison({
        models,
        region: region === "Global" ? undefined : region,
        max_hours: maxHours != null && !Number.isNaN(maxHours) ? maxHours : undefined,
        min_year: minYear != null && !Number.isNaN(minYear) ? minYear : undefined,
        max_year: maxYear != null && !Number.isNaN(maxYear) ? maxYear : undefined,
        limit: 50,
      });
      setComparisonResult(res);
    } catch (e) {
      setComparisonError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setComparisonLoading(false);
    }
  };

  const handlePriceEstimate = async () => {
    setPriceLoading(true);
    setPriceResult(null);
    try {
      const res = await postPriceEstimate({
        model: estimatorForm.model || undefined,
        year: estimatorForm.year ? parseInt(estimatorForm.year, 10) : undefined,
        flight_hours: estimatorForm.flightHours ? parseFloat(estimatorForm.flightHours) : undefined,
        flight_cycles: estimatorForm.flightCycles ? parseInt(estimatorForm.flightCycles, 10) : undefined,
        region: estimatorForm.location && estimatorForm.location !== "Global" ? estimatorForm.location : undefined,
      });
      setPriceResult(res);
    } catch {
      setPriceResult({
        estimated_value_millions: null,
        range_low_millions: null,
        range_high_millions: null,
        confidence_pct: 0,
        market_demand: "Unknown",
        vs_average_pct: null,
        time_to_sale_days: null,
        breakdown: [],
        error: "Request failed",
      });
    } finally {
      setPriceLoading(false);
    }
  };

  const addRecentQuery = (query: string) => {
    const trimmed = query.trim();
    if (!trimmed) return;
    setRecentQueries((prev) => {
      const next = [trimmed, ...prev.filter((q) => q !== trimmed)].slice(0, MAX_RECENT_QUERIES);
      return next;
    });
  };

  const handleResaleAdvisory = async () => {
    if (!resaleQuery.trim()) return;
    setResaleLoading(true);
    setResaleResult(null);
    try {
      const res = await postResaleAdvisory({ query: resaleQuery.trim() });
      setResaleResult(res);
    } catch {
      setResaleResult({ insight: "Unable to load advisory.", error: "Request failed" });
    } finally {
      setResaleLoading(false);
    }
  };

  const navButtonClass = (tabId: TabId) =>
    `flex items-center justify-center gap-2 py-3 px-3 rounded-lg text-center text-xs font-medium min-h-touch transition-all duration-200 ease-out ${activeTab === tabId ? "bg-accent text-white shadow-sm" : "text-slate-600 dark:text-slate-300 hover:bg-accent/10 dark:hover:bg-accent/20 active:bg-accent/15"}`;

  return React.createElement(
    DashboardLayout,
    null,
    /* Left nav: desktop only */
    React.createElement(
      "aside",
      {
        className: "hidden lg:flex w-56 flex-shrink-0 border-r border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900 flex-col py-4 transition-colors duration-200",
        "aria-label": "Research navigation",
      },
      React.createElement("div", { className: "px-4 mb-4" },
        React.createElement("h1", { className: "font-heading text-lg font-semibold text-slate-800 dark:text-slate-200" }, "Research"),
        React.createElement("p", { className: "text-xs text-slate-500 dark:text-slate-400 mt-0.5" }, "HyeAero.AI")
      ),
      React.createElement(
        "nav",
        { className: "flex flex-col gap-0.5 px-2" },
        TABS_VISIBLE.map((tab) =>
          React.createElement(
            "button",
            {
              key: tab.id,
              type: "button",
              onClick: () => setActiveTab(tab.id),
              className: `flex items-center gap-3 py-2.5 px-3 rounded-lg text-left text-sm font-medium min-h-touch transition-all duration-200 ease-out ${activeTab === tab.id ? "bg-accent text-white shadow-sm ring-2 ring-accent/25" : "text-slate-600 dark:text-slate-300 hover:bg-accent/10 dark:hover:bg-accent/20 hover:text-slate-700 dark:hover:text-slate-200 focus:outline-none focus:ring-2 focus:ring-accent/25 focus:ring-inset active:scale-[0.99] active:bg-accent/15"}`,
            },
            React.createElement("span", { className: "flex-shrink-0" }, tab.icon),
            React.createElement("span", null, tab.label)
          )
        )
      )
    ),
    /* Main content: full width on mobile, padding-bottom for bottom nav */
    React.createElement(
      "section",
      { className: "flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden border-r border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 pb-mobile-nav lg:pb-0 transition-colors duration-200" },
      React.createElement(DashboardCenterContent, {
        activeTab,
        isAuthenticated,
        selectedModels,
        toggleModel,
        onSelectAllModels: () => setSelectedModels(new Set(aircraftModels)),
        onDeselectAllModels: () => setSelectedModels(new Set()),
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
        priceTestPayloads,
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
        onConsultantQuerySent: addRecentQuery,
        suggestedQuery,
        onSuggestedQueryConsumed: () => setSuggestedQuery(null),
        phlydataAircraft,
        phlydataTotal,
        phlydataPage,
        phlydataPageSize,
        setPhlydataPage,
        setPhlydataPageSize,
        phlydataSearch,
        setPhlydataSearch,
        phlydataLoading,
        phlydataError,
        phlydataOwnerDetail,
        phlydataDetailLoading,
        onPhlydataRowClick: handlePhlydataRowClick,
        onPhlydataCloseDetail: () => setPhlydataOwnerDetail(null),
      })
    ),
    React.createElement(
      "aside",
      { className: "hidden lg:flex w-72 flex-shrink-0 flex-col border-l border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 overflow-y-auto py-4 px-4 scrollbar-ui transition-colors duration-200" },
      React.createElement(ChatSidebar, { recentQueries, onSuggestedQueryClick: (q) => setSuggestedQuery(q) })
    ),
    /* Mobile bottom navigation: touch-friendly, theme colors */
    React.createElement(
      "nav",
      {
        className: "lg:hidden fixed bottom-0 left-0 right-0 z-40 flex items-stretch justify-around bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700 shadow-[0_-1px_6px_rgba(15,40,71,0.06)] dark:shadow-[0_-1px_6px_rgba(0,0,0,0.2)] transition-colors duration-200",
        "aria-label": "Research tabs",
        style: { paddingBottom: "max(env(safe-area-inset-bottom), 8px)" },
      },
      TABS_VISIBLE.map((tab) =>
        React.createElement(
          "button",
          {
            key: tab.id,
            type: "button",
            onClick: () => setActiveTab(tab.id),
            className: navButtonClass(tab.id),
            "aria-current": activeTab === tab.id ? "page" : undefined,
          },
          React.createElement("span", { className: "flex-shrink-0" }, tab.icon),
          React.createElement("span", { className: "hidden sm:inline truncate max-w-[4rem]" }, tab.label)
        )
      )
    )
  );
}
