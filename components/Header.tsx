"use client";

import Link from "next/link";
import { Hexagon, Moon, Sun } from "lucide-react";
import { useTheme } from "@/lib/ThemeContext";
import { useAuth } from "@/contexts/AuthContext";
import { userHasStaffAccess, userHasSuperAdminAccess } from "@/lib/auth-api";

export default function Header() {
  const { theme, toggleTheme } = useTheme();
  const { user, loading, logout } = useAuth();
  const staff = userHasStaffAccess(user);

  return (
    <header className="sticky top-0 z-50 flex-shrink-0 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 transition-colors duration-200">
      <div className="max-w-6xl mx-auto px-3 sm:px-6 h-12 sm:h-14 flex items-center justify-between gap-2">
        <Link
          href="/"
          className="flex items-center gap-1.5 sm:gap-2 font-heading rounded-lg py-2 px-2 -ml-2 min-h-touch text-primary dark:text-slate-100 transition-all duration-200 ease-out hover:bg-accent/10 dark:hover:bg-accent/20 focus:outline-none focus:ring-2 focus:ring-accent/25 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-slate-900 active:scale-[0.99] active:bg-accent/15"
        >
          <span className="text-accent transition-colors duration-200 flex-shrink-0" aria-hidden>
            <Hexagon className="w-6 h-6 sm:w-7 sm:h-7" aria-hidden="true" />
          </span>
          <span className="text-base sm:text-lg font-semibold tracking-tight truncate">
            HyeAero<span className="text-accent">.AI</span>
          </span>
        </Link>
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          {!loading && staff && (
            <>
              <Link
                href="/admin/users"
                className="hidden sm:inline text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-accent truncate max-w-[7rem]"
              >
                Users
              </Link>
              <Link
                href="/admin/queries"
                className="hidden sm:inline text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-accent truncate max-w-[7rem]"
              >
                Queries
              </Link>
              {userHasSuperAdminAccess(user) && (
                <Link
                  href="/admin/admins"
                  className="hidden md:inline text-xs font-medium text-amber-700 dark:text-amber-400 hover:underline truncate max-w-[6rem]"
                >
                  Admins
                </Link>
              )}
            </>
          )}
          {!loading && !user && (
            <>
              <Link
                href="/login"
                className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-accent"
              >
                Sign in
              </Link>
              <Link
                href="/signup"
                className="text-xs sm:text-sm font-medium text-accent hover:underline"
              >
                Sign up
              </Link>
            </>
          )}
          {!loading && user && user.status === "active" && (
            <span className="hidden md:inline text-xs text-slate-500 dark:text-slate-400 truncate max-w-[10rem]">
              {user.email}
            </span>
          )}
          {!loading && user && user.status === "active" && (
            <button
              type="button"
              onClick={logout}
              className="text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-accent"
            >
              Sign out
            </button>
          )}
          <button
            type="button"
            onClick={toggleTheme}
            className="rounded-lg p-2 min-h-touch min-w-touch flex items-center justify-center text-slate-600 dark:text-slate-300 transition-all duration-200 ease-out hover:bg-accent/10 dark:hover:bg-accent/20 focus:outline-none focus:ring-2 focus:ring-accent/25 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-slate-900"
            aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          >
            {theme === "dark" ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
        </div>
      </div>
    </header>
  );
}
