"use client";

import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
export default function PendingPage() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
    if (!loading && user?.status === "active") router.replace("/");
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        Loading…
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-slate-50 dark:bg-slate-950">
      <Header />
      <main className="flex-1 flex items-center justify-center p-6">
        <div className="max-w-md rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-8 text-center shadow-sm">
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-2">Account pending</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
            {user.status === "rejected"
              ? "Your registration was not approved. Contact support if this is a mistake."
              : "The super admin must activate your account before you can use the dashboard."}
          </p>
          <button
            type="button"
            onClick={() => {
              logout();
              router.replace("/login");
            }}
            className="text-sm text-accent hover:underline"
          >
            Sign out
          </button>
          <p className="mt-4">
            <Link href="/" className="text-sm text-slate-500 hover:text-accent">
              Back home
            </Link>
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
}
