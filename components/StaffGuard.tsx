"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { userHasStaffAccess, userHasSuperAdminAccess } from "@/lib/auth-api";

/**
 * Active users with role ``admin`` or ``super_admin`` only. Wrap with {@link AuthGuard} on pages
 * that require sign-in so guests are sent to login, not the home dashboard.
 */
export default function StaffGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!userHasStaffAccess(user)) router.replace("/");
  }, [loading, user, router]);

  if (loading) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center text-slate-500">Loading…</div>
    );
  }

  if (!userHasStaffAccess(user)) return null;

  return <>{children}</>;
}

/** Active ``super_admin`` only (e.g. `/admin/admins`). */
export function SuperAdminGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!userHasSuperAdminAccess(user)) router.replace("/");
  }, [loading, user, router]);

  if (loading) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center text-slate-500">Loading…</div>
    );
  }

  if (!userHasSuperAdminAccess(user)) return null;

  return <>{children}</>;
}
