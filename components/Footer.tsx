"use client";

import Link from "next/link";

export default function Footer() {
  return (
    <footer className="hidden lg:block flex-shrink-0 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 py-3 sm:py-4 transition-colors duration-200">
      <div className="max-w-4xl mx-auto px-3 sm:px-6 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-500 dark:text-slate-400">
        <Link href="https://www.hye.aero/" target="_blank" rel="noopener noreferrer" className="rounded px-2 py-1.5 min-h-touch flex items-center transition-all duration-200 ease-out hover:text-accent hover:bg-accent/10 dark:hover:bg-accent/20 focus:outline-none focus:ring-2 focus:ring-accent/25 focus:ring-inset">
          hye.aero
        </Link>
        <span>© {new Date().getFullYear()} HyeAero.AI</span>
      </div>
    </footer>
  );
}
