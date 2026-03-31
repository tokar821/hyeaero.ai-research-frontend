"use client";

import { useEffect, useId, useRef, useState } from "react";
import { DayPicker } from "react-day-picker";
import { format, parseISO } from "date-fns";
import { CalendarDays } from "lucide-react";

/** Today's calendar date in UTC as `YYYY-MM-DD` (matches API filter semantics). */
export function utcTodayYmd(): string {
  const n = new Date();
  const y = n.getUTCFullYear();
  const m = String(n.getUTCMonth() + 1).padStart(2, "0");
  const d = String(n.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function utcNoonFromYmd(ymd: string): Date {
  return parseISO(`${ymd}T12:00:00.000Z`);
}

function ymdFromUtcSelected(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

type UtcDatePickerFieldProps = {
  id?: string;
  label: string;
  value: string;
  onChange: (ymd: string) => void;
};

export function UtcDatePickerField({ id, label, value, onChange }: UtcDatePickerFieldProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const autoId = useId();
  const fieldId = id ?? `${autoId}-utc-date`;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const display = value ? format(utcNoonFromYmd(value), "MMM d, yyyy") : "Select date…";
  const nowY = new Date().getUTCFullYear();

  return (
    <div ref={rootRef} className="relative">
      <span id={`${fieldId}-label`} className="block text-xs font-medium text-slate-600 dark:text-slate-400">
        {label}
      </span>
      <button
        type="button"
        id={fieldId}
        aria-labelledby={`${fieldId}-label`}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((o) => !o)}
        className="mt-1 w-full flex items-center justify-between gap-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1.5 text-sm text-left text-slate-900 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700/50 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-slate-900"
      >
        <span className={value ? "truncate" : "truncate text-slate-400 dark:text-slate-500"}>{display}</span>
        <CalendarDays className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" aria-hidden />
      </button>
      {open && (
        <div
          className="rdp-popover-surface absolute left-0 top-full z-50 mt-1 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 p-2 sm:p-3 shadow-lg"
          role="dialog"
          aria-label={`${label} calendar`}
        >
          <DayPicker
            mode="single"
            timeZone="UTC"
            captionLayout="dropdown"
            fromYear={nowY - 5}
            toYear={nowY + 1}
            selected={value ? utcNoonFromYmd(value) : undefined}
            onSelect={(d) => {
              if (d) onChange(ymdFromUtcSelected(d));
              setOpen(false);
            }}
            defaultMonth={value ? utcNoonFromYmd(value) : utcNoonFromYmd(utcTodayYmd())}
          />
        </div>
      )}
    </div>
  );
}
