"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import AuthGuard from "@/components/AuthGuard";
import StaffGuard from "@/components/StaffGuard";
import { API_BASE_URL } from "@/lib/api";
import { authHeaderRecord } from "@/lib/auth-token";
import type { UserPublic } from "@/lib/auth-api";
import { useAuth } from "@/contexts/AuthContext";
import { ChevronLeft, Trash2, RefreshCw, KeyRound } from "lucide-react";
import { userFacingAdminError } from "@/lib/admin-api-errors";

type ListRes = { total: number; items: UserPublic[] };

function hdr() {
  return { ...authHeaderRecord(), "Content-Type": "application/json", Accept: "application/json" };
}

function AdminUsersInner() {
  const { user: me, refresh } = useAuth();
  const [items, setItems] = useState<UserPublic[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");

  const [showAdd, setShowAdd] = useState(false);
  const [addEmail, setAddEmail] = useState("");
  const [addName, setAddName] = useState("");
  const [addCountry, setAddCountry] = useState("");
  const [addPass, setAddPass] = useState("");
  const [addRole, setAddRole] = useState<"user" | "admin">("user");
  const [addStatus, setAddStatus] = useState<"pending" | "active" | "rejected">("pending");

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const sp = new URLSearchParams({ limit: "100", offset: "0" });
      if (statusFilter) sp.set("status", statusFilter);
      const res = await fetch(`${API_BASE_URL}/api/admin/users?${sp}`, { headers: hdr(), cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as ListRes & { detail?: string };
      if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
      setItems(data.items || []);
      setTotal(data.total ?? 0);
    } catch (e) {
      setErr(userFacingAdminError(e instanceof Error ? e.message : "Failed to load users"));
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const patchUser = async (id: number, body: Record<string, unknown>) => {
    setErr(null);
    const res = await fetch(`${API_BASE_URL}/api/admin/users/${id}`, {
      method: "PATCH",
      headers: hdr(),
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data as { detail?: string }).detail || `HTTP ${res.status}`);
    await load();
    await refresh();
  };

  const deleteUser = async (id: number, email: string) => {
    if (!confirm(`Delete user ${email}?`)) return;
    setErr(null);
    const res = await fetch(`${API_BASE_URL}/api/admin/users/${id}`, { method: "DELETE", headers: hdr() });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data as { detail?: string }).detail || `HTTP ${res.status}`);
    await load();
  };

  const resetPw = async (id: number) => {
    const pw = window.prompt("New password (min 8 characters):");
    if (!pw || pw.length < 8) return;
    setErr(null);
    const res = await fetch(`${API_BASE_URL}/api/admin/users/${id}/reset-password`, {
      method: "POST",
      headers: hdr(),
      body: JSON.stringify({ new_password: pw }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data as { detail?: string }).detail || `HTTP ${res.status}`);
  };

  const submitCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/users`, {
        method: "POST",
        headers: hdr(),
        body: JSON.stringify({
          email: addEmail.trim(),
          full_name: addName.trim(),
          country: addCountry.trim(),
          password: addPass,
          role: addRole,
          status: me?.role === "super_admin" ? addStatus : "pending",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { detail?: string }).detail || `HTTP ${res.status}`);
      setShowAdd(false);
      setAddEmail("");
      setAddName("");
      setAddCountry("");
      setAddPass("");
      await load();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Create failed");
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950">
      <Header />
      <main className="flex-1 max-w-6xl mx-auto w-full px-3 sm:px-6 py-8">
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <Link href="/" className="inline-flex items-center gap-1 text-sm text-slate-600 dark:text-slate-400 hover:text-accent">
            <ChevronLeft className="w-4 h-4" aria-hidden />
            Dashboard
          </Link>
          <h1 className="text-xl font-semibold text-primary dark:text-slate-100">User management</h1>
        </div>

        {me?.role === "super_admin" && (
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
            Super admin: also see{" "}
            <Link href="/admin/admins" className="text-accent hover:underline">
              Admin accounts
            </Link>
            .
          </p>
        )}

        <div className="flex flex-wrap gap-2 mb-4">
          <button
            type="button"
            onClick={() => load()}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-1.5 text-sm"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} aria-hidden />
            Refresh
          </button>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1.5 text-sm"
          >
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="active">Active</option>
            <option value="rejected">Rejected</option>
          </select>
          <button
            type="button"
            onClick={() => setShowAdd((s) => !s)}
            className="rounded-lg bg-accent text-white px-3 py-1.5 text-sm"
          >
            Add user
          </button>
        </div>

        {showAdd && (
          <form
            onSubmit={submitCreateUser}
            className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 mb-6 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm"
          >
            <input
              required
              type="email"
              placeholder="Email"
              value={addEmail}
              onChange={(e) => setAddEmail(e.target.value)}
              className="rounded-lg border border-slate-300 dark:border-slate-600 px-2 py-2 bg-white dark:bg-slate-800"
            />
            <input
              required
              placeholder="Full name"
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
              className="rounded-lg border border-slate-300 dark:border-slate-600 px-2 py-2 bg-white dark:bg-slate-800"
            />
            <input
              required
              placeholder="Country"
              value={addCountry}
              onChange={(e) => setAddCountry(e.target.value)}
              className="rounded-lg border border-slate-300 dark:border-slate-600 px-2 py-2 bg-white dark:bg-slate-800"
            />
            <input
              required
              type="password"
              minLength={8}
              placeholder="Password"
              value={addPass}
              onChange={(e) => setAddPass(e.target.value)}
              className="rounded-lg border border-slate-300 dark:border-slate-600 px-2 py-2 bg-white dark:bg-slate-800"
            />
            <select
              value={addRole}
              onChange={(e) => setAddRole(e.target.value as "user" | "admin")}
              className="rounded-lg border border-slate-300 dark:border-slate-600 px-2 py-2 bg-white dark:bg-slate-800"
            >
              <option value="user">Role: user</option>
              <option value="admin">Role: admin</option>
            </select>
            <select
              value={addStatus}
              onChange={(e) => setAddStatus(e.target.value as "pending" | "active" | "rejected")}
              className="rounded-lg border border-slate-300 dark:border-slate-600 px-2 py-2 bg-white dark:bg-slate-800"
            >
              <option value="pending">Status: pending</option>
              <option value="active">Status: active</option>
              <option value="rejected">Status: rejected</option>
            </select>
            <div className="sm:col-span-2 flex gap-2">
              <button type="submit" className="rounded-lg bg-primary text-white dark:bg-primary-light px-4 py-2">
                Create
              </button>
              <button type="button" onClick={() => setShowAdd(false)} className="rounded-lg border px-4 py-2">
                Cancel
              </button>
            </div>
          </form>
        )}

        {err && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/40 px-3 py-2 text-sm text-red-800 dark:text-red-200">
            {err}
          </div>
        )}

        <p className="text-xs text-slate-500 mb-2">{total} user(s)</p>

        <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-x-auto bg-white dark:bg-slate-900">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
              <tr>
                <th className="p-2">Email</th>
                <th className="p-2">Name</th>
                <th className="p-2">Country</th>
                <th className="p-2">Role</th>
                <th className="p-2">Status</th>
                <th className="p-2 w-48">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {items.map((u) => (
                <UserRow
                  key={u.id}
                  u={u}
                  meId={me?.id}
                  isSuperAdmin={me?.role === "super_admin"}
                  onErr={(msg) => setErr(userFacingAdminError(msg ?? ""))}
                  onPatch={patchUser}
                  onDelete={deleteUser}
                  onReset={resetPw}
                />
              ))}
            </tbody>
          </table>
        </div>
      </main>
      <Footer />
    </div>
  );
}

function UserRow({
  u,
  meId,
  isSuperAdmin,
  onErr,
  onPatch,
  onDelete,
  onReset,
}: {
  u: UserPublic;
  meId?: number;
  isSuperAdmin: boolean;
  onErr: (s: string | null) => void;
  onPatch: (id: number, b: Record<string, unknown>) => Promise<void>;
  onDelete: (id: number, email: string) => Promise<void>;
  onReset: (id: number) => Promise<void>;
}) {
  const busy = u.role === "super_admin";
  return (
    <tr className="align-top">
      <td className="p-2 font-mono text-xs">{u.email}</td>
      <td className="p-2">{u.full_name}</td>
      <td className="p-2">{u.country}</td>
      <td className="p-2">
        {busy ? (
          <span className="text-amber-600 dark:text-amber-400 text-xs">super_admin</span>
        ) : (
          <select
            value={u.role === "admin" ? "admin" : "user"}
            onChange={(e) => {
              const role = e.target.value as "user" | "admin";
              onPatch(u.id, { role }).catch((e) => onErr(e instanceof Error ? e.message : "Patch failed"));
            }}
            className="rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs px-1 py-1"
          >
            <option value="user">user</option>
            <option value="admin">admin</option>
          </select>
        )}
      </td>
      <td className="p-2">
        {busy ? (
          <span className="text-xs font-medium text-amber-700 dark:text-amber-400">{u.status}</span>
        ) : !isSuperAdmin ? (
          <span className="text-xs text-slate-600 dark:text-slate-400">{u.status}</span>
        ) : (
          <select
            value={u.status}
            onChange={(e) => {
              const status = e.target.value as "pending" | "active" | "rejected";
              onPatch(u.id, { status }).catch((er) => onErr(er instanceof Error ? er.message : "Patch failed"));
            }}
            className="rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs px-1 py-1"
          >
            <option value="pending">pending</option>
            <option value="active">active</option>
            <option value="rejected">rejected</option>
          </select>
        )}
      </td>
      <td className="p-2">
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            title="Reset password"
            disabled={busy || u.id === meId}
            onClick={() => onReset(u.id).catch((e) => onErr(e instanceof Error ? e.message : "Reset failed"))}
            className="p-1.5 rounded border border-slate-300 dark:border-slate-600 disabled:opacity-40"
          >
            <KeyRound className="w-4 h-4" aria-hidden />
          </button>
          <button
            type="button"
            title="Delete"
            disabled={busy || u.id === meId}
            onClick={() => onDelete(u.id, u.email).catch((e) => onErr(e instanceof Error ? e.message : "Delete failed"))}
            className="p-1.5 rounded text-red-600 border border-red-200 dark:border-red-800 disabled:opacity-40"
          >
            <Trash2 className="w-4 h-4" aria-hidden />
          </button>
        </div>
      </td>
    </tr>
  );
}

export default function AdminUsersPage() {
  return (
    <AuthGuard>
      <StaffGuard>
        <AdminUsersInner />
      </StaffGuard>
    </AuthGuard>
  );
}
