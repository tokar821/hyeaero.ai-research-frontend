"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import AuthGuard from "@/components/AuthGuard";
import { SuperAdminGuard } from "@/components/StaffGuard";
import { API_BASE_URL } from "@/lib/api";
import { authHeaderRecord } from "@/lib/auth-token";
import { useAuth } from "@/contexts/AuthContext";
import type { UserPublic } from "@/lib/auth-api";
import { ChevronLeft } from "lucide-react";

type ListRes = { total: number; items: UserPublic[] };

function SuperAdminAdminsInner() {
  const { user } = useAuth();
  const [items, setItems] = useState<UserPublic[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!user || user.role !== "super_admin") return;
    void (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/super-admin/admins`, {
          headers: { ...authHeaderRecord(), Accept: "application/json" },
          cache: "no-store",
        });
        const data = (await res.json().catch(() => ({}))) as ListRes & { detail?: string };
        if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
        setItems(data.items || []);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Failed to load");
      }
    })();
  }, [user]);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950">
      <Header />
      <main className="flex-1 max-w-3xl mx-auto w-full px-3 sm:px-6 py-8">
        <Link href="/admin/users" className="inline-flex items-center gap-1 text-sm text-accent mb-4">
          <ChevronLeft className="w-4 h-4" aria-hidden />
          All users
        </Link>
        <h1 className="text-xl font-semibold text-primary dark:text-slate-100 mb-2">Admin accounts</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
          Users with role <code className="bg-slate-200 dark:bg-slate-800 px-1 rounded">admin</code>. Manage roles and
          access from{" "}
          <Link href="/admin/users" className="text-accent underline">
            User management
          </Link>
          .
        </p>
        {err && <div className="mb-4 text-sm text-red-600 dark:text-red-400">{err}</div>}
        <ul className="rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-200 dark:divide-slate-700 bg-white dark:bg-slate-900">
          {items.length === 0 ? (
            <li className="p-4 text-sm text-slate-500">No admin-role users yet.</li>
          ) : (
            items.map((a) => (
              <li key={a.id} className="p-4 flex flex-wrap justify-between gap-2 text-sm">
                <span className="font-medium text-slate-900 dark:text-slate-100">{a.full_name}</span>
                <span className="font-mono text-xs text-slate-600 dark:text-slate-400">{a.email}</span>
                <span className="text-xs text-slate-500">{a.status}</span>
              </li>
            ))
          )}
        </ul>
      </main>
      <Footer />
    </div>
  );
}

export default function SuperAdminAdminsPage() {
  return (
    <AuthGuard>
      <SuperAdminGuard>
        <SuperAdminAdminsInner />
      </SuperAdminGuard>
    </AuthGuard>
  );
}
