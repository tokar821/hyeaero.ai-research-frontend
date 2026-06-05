/** Structured broker comparison card from ``data_used.comparison_broker_ui``. */

export type ComparisonBrokerSpecRow = {
  dimension: string;
  a: string;
  b: string;
};

export type ComparisonBrokerUi = {
  model_a: string;
  model_b: string;
  specs: ComparisonBrokerSpecRow[];
  verification_status?: "verified" | "partial";
  missing_models?: string[];
  broker_notice?: string;
  broker_summary?: string;
  commentary?: string[];
  a_wins?: string[];
  b_wins?: string[];
  tradeoffs?: string[];
  buy_a_if?: string;
  buy_b_if?: string;
  operate_pick?: string;
  operate_why?: string;
};

export function parseComparisonBrokerUi(raw: unknown): ComparisonBrokerUi | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  const model_a = typeof rec.model_a === "string" ? rec.model_a.trim() : "";
  const model_b = typeof rec.model_b === "string" ? rec.model_b.trim() : "";
  if (!model_a || !model_b) return null;

  const specs: ComparisonBrokerSpecRow[] = [];
  if (Array.isArray(rec.specs)) {
    for (const row of rec.specs) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      const dimension = typeof r.dimension === "string" ? r.dimension.trim() : "";
      if (!dimension) continue;
      specs.push({
        dimension,
        a: typeof r.a === "string" ? r.a : String(r.a ?? "—"),
        b: typeof r.b === "string" ? r.b : String(r.b ?? "—"),
      });
    }
  }

  const strList = (v: unknown): string[] | undefined => {
    if (!Array.isArray(v)) return undefined;
    const out = v.map((x) => (typeof x === "string" ? x.trim() : "")).filter(Boolean);
    return out.length ? out : undefined;
  };

  const broker_notice =
    typeof rec.broker_notice === "string" ? rec.broker_notice.trim() : undefined;
  const broker_summary =
    typeof rec.broker_summary === "string" ? rec.broker_summary.trim() : undefined;
  const verification_status =
    rec.verification_status === "verified" || rec.verification_status === "partial"
      ? rec.verification_status
      : undefined;

  return {
    model_a,
    model_b,
    specs,
    verification_status,
    missing_models: strList(rec.missing_models),
    broker_notice: broker_notice || undefined,
    broker_summary: broker_summary || undefined,
    commentary: strList(rec.commentary),
    a_wins: strList(rec.a_wins),
    b_wins: strList(rec.b_wins),
    tradeoffs: strList(rec.tradeoffs),
    buy_a_if: typeof rec.buy_a_if === "string" ? rec.buy_a_if.trim() : undefined,
    buy_b_if: typeof rec.buy_b_if === "string" ? rec.buy_b_if.trim() : undefined,
    operate_pick: typeof rec.operate_pick === "string" ? rec.operate_pick.trim() : undefined,
    operate_why: typeof rec.operate_why === "string" ? rec.operate_why.trim() : undefined,
  };
}

/** Lines not already covered by the chat bubble / broker_summary lead-in. */
export function linesBeyondLeadIn(
  lines: string[] | undefined,
  leadIn: string
): string[] {
  const low = (leadIn || "").trim().toLowerCase();
  if (!lines?.length) return [];
  return lines.filter((line) => {
    const t = line.trim();
    return t && !low.includes(t.toLowerCase());
  });
}

/** @deprecated Use {@link linesBeyondLeadIn} */
export function commentaryBeyondSummary(
  commentary: string[] | undefined,
  summaryText: string
): string[] {
  return linesBeyondLeadIn(commentary, summaryText);
}

export function comparisonBrokerUiHasContent(ui: ComparisonBrokerUi | null | undefined): boolean {
  if (!ui) return false;
  return Boolean(
    ui.specs.length ||
      ui.broker_notice ||
      ui.broker_summary ||
      ui.commentary?.length ||
      ui.a_wins?.length ||
      ui.b_wins?.length ||
      ui.tradeoffs?.length ||
      ui.buy_a_if ||
      ui.buy_b_if
  );
}

/** Full plain-text comparison for copy / PDF when the bubble shows only a short lead-in. */
export function comparisonBrokerUiPlainText(ui: ComparisonBrokerUi): string {
  const lines: string[] = [];
  if (ui.broker_summary) lines.push(ui.broker_summary);
  else if (ui.broker_notice) lines.push(ui.broker_notice);
  else lines.push(`${ui.model_a} vs ${ui.model_b}`);
  for (const c of commentaryBeyondSummary(ui.commentary, ui.broker_summary || lines[0] || "")) {
    if (!lines.includes(c)) lines.push(c);
  }
  for (const row of ui.specs) {
    lines.push(`- ${row.dimension}: ${ui.model_a} ${row.a}; ${ui.model_b} ${row.b}`);
  }
  if (ui.a_wins?.length) {
    lines.push(`${ui.model_a} wins on: ${ui.a_wins.join(", ")}`);
  }
  if (ui.b_wins?.length) {
    lines.push(`${ui.model_b} wins on: ${ui.b_wins.join(", ")}`);
  }
  for (const t of linesBeyondLeadIn(ui.tradeoffs, ui.broker_summary || lines[0] || "")) {
    lines.push(`- ${t}`);
  }
  if (ui.buy_a_if) lines.push(`Buy ${ui.model_a} if: ${ui.buy_a_if}`);
  if (ui.buy_b_if) lines.push(`Buy ${ui.model_b} if: ${ui.buy_b_if}`);
  return lines.join("\n");
}
