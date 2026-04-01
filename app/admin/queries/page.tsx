"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import AuthGuard from "@/components/AuthGuard";
import StaffGuard from "@/components/StaffGuard";
import { API_BASE_URL } from "@/lib/api";
import { authHeaderRecord } from "@/lib/auth-token";
import { Trash2, RefreshCw, ChevronLeft } from "lucide-react";
import { UtcDatePickerField, utcTodayYmd } from "@/components/admin/UtcDatePickerField";
import { userFacingAdminError } from "@/lib/admin-api-errors";

export type ConsultantQueryLogItem = {
  id: number;
  created_at: string;
  query_text: string;
  endpoint: string;
  history_turn_count: number;
  client_ip?: string | null;
  user_agent?: string | null;
  user_id?: number | null;
  user_email?: string | null;
  user_full_name?: string | null;
  answer_text?: string | null;
};

type ListResponse = {
  total: number;
  items: ConsultantQueryLogItem[];
};

function listHeaders(): HeadersInit {
  return { ...authHeaderRecord(), Accept: "application/json" };
}

function AdminConsultantQueriesInner() {
  const [items, setItems] = useState<ConsultantQueryLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<number>>(() => new Set());

  const [dateFrom, setDateFrom] = useState(() => utcTodayYmd());
  const [dateTo, setDateTo] = useState(() => utcTodayYmd());
  const [endpoint, setEndpoint] = useState("");
  const [q, setQ] = useState("");
  const [userIdFilter, setUserIdFilter] = useState("");
  const [limit] = useState(50);
  const [offset, setOffset] = useState(0);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    const sp = new URLSearchParams();
    sp.set("limit", String(limit));
    sp.set("offset", String(offset));
    if (dateFrom.trim()) sp.set("date_from", dateFrom.trim());
    if (dateTo.trim()) sp.set("date_to", dateTo.trim());
    if (endpoint === "sync" || endpoint === "stream") sp.set("endpoint", endpoint);
    if (q.trim()) sp.set("q", q.trim());
    const uid = userIdFilter.trim();
    if (uid && /^\d+$/.test(uid)) sp.set("user_id", uid);
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/admin/consultant-queries?${sp.toString()}`, {
          headers: listHeaders(),
          cache: "no-store",
        });
        const data = (await res.json().catch(() => ({}))) as ListResponse & { detail?: string };
        if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
        if (cancelled) return;
        setItems(data.items || []);
        setTotal(typeof data.total === "number" ? data.total : 0);
        setSelected(new Set());
      } catch (e) {
        if (cancelled) return;
        setError(userFacingAdminError(e instanceof Error ? e.message : "Failed to load"));
        setItems([]);
        setTotal(0);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [limit, offset, dateFrom, dateTo, endpoint, q, userIdFilter, refreshTick]);

  const applyFilters = () => {
    setOffset(0);
    setRefreshTick((t) => t + 1);
  };

  const deleteOne = async (id: number) => {
    if (!confirm(`Delete query log #${id}?`)) return;
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/consultant-queries/${id}`, {
        method: "DELETE",
        headers: listHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { detail?: string }).detail || `HTTP ${res.status}`);
      setRefreshTick((t) => t + 1);
    } catch (e) {
      setError(userFacingAdminError(e instanceof Error ? e.message : "Delete failed"));
    }
  };

  const deleteSelected = async () => {
    const ids = Array.from(selected);
    if (!ids.length) return;
    if (!confirm(`Delete ${ids.length} selected row(s)?`)) return;
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/consultant-queries/bulk-delete`, {
        method: "POST",
        headers: { ...listHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { detail?: string }).detail || `HTTP ${res.status}`);
      setRefreshTick((t) => t + 1);
    } catch (e) {
      setError(userFacingAdminError(e instanceof Error ? e.message : "Bulk delete failed"));
    }
  };

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllOnPage = () => {
    const pageIds = items.map((r) => r.id);
    const allSelected = pageIds.length && pageIds.every((id) => selected.has(id));
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) pageIds.forEach((id) => next.delete(id));
      else pageIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const pageMax = Math.max(0, Math.ceil(total / limit) - 1);
  const pageNum = Math.min(pageMax, Math.floor(offset / limit));

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-slate-50 dark:bg-slate-950">
      <Header />
      <main className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-3 sm:px-6 py-6 sm:py-8 pb-24">
          <div className="flex flex-wrap items-center gap-3 mb-6">
            <Link
              href="/"
              className="inline-flex items-center gap-1 text-sm text-slate-600 dark:text-slate-400 hover:text-accent"
            >
              <ChevronLeft className="w-4 h-4" aria-hidden />
              Dashboard
            </Link>
            <h1 className="text-xl sm:text-2xl font-semibold text-primary dark:text-slate-100">
              Consultant query log
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2 mb-4">
            <button
              type="button"
              onClick={() => setRefreshTick((t) => t + 1)}
              disabled={loading}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-1.5 text-sm hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} aria-hidden />
              Refresh
            </button>
            {selected.size > 0 && (
              <button
                type="button"
                onClick={deleteSelected}
                className="inline-flex items-center gap-1 rounded-lg border border-red-300 dark:border-red-800 text-red-700 dark:text-red-300 px-3 py-1.5 text-sm hover:bg-red-50 dark:hover:bg-red-950/40"
              >
                <Trash2 className="w-4 h-4" aria-hidden />
                Delete selected ({selected.size})
              </button>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 mb-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <UtcDatePickerField label="From date (UTC)" value={dateFrom} onChange={setDateFrom} />
              <UtcDatePickerField label="To date (UTC)" value={dateTo} onChange={setDateTo} />
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                Endpoint
                <select
                  value={endpoint}
                  onChange={(e) => setEndpoint(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1.5 text-sm"
                >
                  <option value="">All</option>
                  <option value="sync">sync</option>
                  <option value="stream">stream</option>
                </select>
              </label>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                Search text
                <input
                  type="search"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Question or answer text…"
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1.5 text-sm"
                />
              </label>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                User id
                <input
                  type="text"
                  inputMode="numeric"
                  value={userIdFilter}
                  onChange={(e) => setUserIdFilter(e.target.value.replace(/\D/g, ""))}
                  placeholder="App user id"
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1.5 text-sm"
                />
              </label>
            </div>
            <button
              type="button"
              onClick={applyFilters}
              className="rounded-lg bg-primary text-white px-4 py-2 text-sm font-medium hover:opacity-95 dark:bg-primary-light"
            >
              Apply filters
            </button>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Showing {items.length} of {total} matching rows.
            </p>
          </div>

          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/40 dark:border-red-900 px-3 py-2 text-sm text-red-800 dark:text-red-200">
              {error}
            </div>
          )}

          <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-900">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300">
                  <tr>
                    <th className="p-2 w-10">
                      <input
                        type="checkbox"
                        aria-label="Select all on page"
                        checked={items.length > 0 && items.every((r) => selected.has(r.id))}
                        onChange={toggleSelectAllOnPage}
                      />
                    </th>
                    <th className="p-2 whitespace-nowrap">When (UTC)</th>
                    <th className="p-2 whitespace-nowrap">Type</th>
                    <th className="p-2 whitespace-nowrap min-w-[7rem]">User</th>
                    <th className="p-2">Question</th>
                    <th className="p-2 min-w-[12rem]">Answer</th>
                    <th className="p-2 whitespace-nowrap">Hist</th>
                    <th className="p-2 w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  {items.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 align-top">
                      <td className="p-2">
                        <input
                          type="checkbox"
                          checked={selected.has(row.id)}
                          onChange={() => toggleSelect(row.id)}
                          aria-label={`Select ${row.id}`}
                        />
                      </td>
                      <td className="p-2 whitespace-nowrap text-slate-600 dark:text-slate-400 text-xs">
                        {row.created_at.replace("T", " ").replace("+00:00", "Z")}
                      </td>
                      <td className="p-2 whitespace-nowrap text-xs font-mono text-accent">{row.endpoint}</td>
                      <td className="p-2 text-xs text-slate-600 dark:text-slate-400 max-w-[10rem]">
                        <div className="truncate" title={row.user_full_name || row.user_email || ""}>
                          {row.user_full_name ? (
                            <>
                              <span className="font-medium text-slate-700 dark:text-slate-300 block truncate">
                                {row.user_full_name}
                              </span>
                              <span className="block truncate text-slate-500">{row.user_email || "—"}</span>
                            </>
                          ) : (
                            <span className="truncate block">
                              {row.user_email || (row.user_id != null ? `#${row.user_id}` : "—")}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-2 text-slate-800 dark:text-slate-200 max-w-xl break-words whitespace-pre-wrap">
                        {row.query_text}
                      </td>
                      <td className="p-2 text-slate-700 dark:text-slate-300 max-w-xl break-words whitespace-pre-wrap text-xs">
                        {row.answer_text ? (
                          <span title={row.answer_text}>
                            {row.answer_text.length > 400
                              ? `${row.answer_text.slice(0, 400)}…`
                              : row.answer_text}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">—</span>
                        )}
                      </td>
                      <td className="p-2 text-xs text-slate-500">{row.history_turn_count}</td>
                      <td className="p-2">
                        <button
                          type="button"
                          onClick={() => deleteOne(row.id)}
                          className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" aria-hidden />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {items.length === 0 && !loading && (
              <p className="p-8 text-center text-slate-500 text-sm">No rows match the current filters.</p>
            )}
          </div>

          {total > limit && (
            <div className="flex flex-wrap items-center justify-between gap-3 mt-4">
              <span className="text-sm text-slate-600 dark:text-slate-400">
                Page {pageNum + 1} of {pageMax + 1}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={offset < limit || loading}
                  onClick={() => setOffset((o) => Math.max(0, o - limit))}
                  className="rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-1.5 text-sm disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={offset + limit >= total || loading}
                  onClick={() => setOffset((o) => o + limit)}
                  className="rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-1.5 text-sm disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}

export default function AdminConsultantQueriesPage() {
  return (
    <AuthGuard>
      <StaffGuard>
        <AdminConsultantQueriesInner />
      </StaffGuard>
    </AuthGuard>
  );
}
