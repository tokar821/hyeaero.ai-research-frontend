/**
 * Slim server conversation state echoed on each RAG request so tail/model
 * follow-ups survive F5 (paired with message history).
 */

export type ConsultantConversationState = Record<string, unknown>;

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/** Build the payload the API expects on the next turn. */
export function slimConversationStateForStorage(
  dataUsed: Record<string, unknown> | null | undefined
): ConsultantConversationState | undefined {
  const du = asRecord(dataUsed);
  if (!du) return undefined;

  const out: ConsultantConversationState = {};
  const ccs = asRecord(du.consultant_conversation_state);
  if (ccs) {
    const slim: ConsultantConversationState = {};
    for (const k of [
      "current_aircraft_reference",
      "current_visual_intent",
      "current_mission",
      "current_budget",
      "current_passenger_count",
      "current_cabin_preference",
      "conversation_mode",
    ] as const) {
      const v = ccs[k];
      if (v !== undefined && v !== null && String(v).trim()) {
        slim[k] = v;
      }
    }
    const mem = asRecord(ccs.conversation_memory);
    if (mem) {
      const memSlim: ConsultantConversationState = {};
      for (const k of ["active_tail", "active_aircraft", "active_mission", "active_budget"] as const) {
        const v = mem[k];
        if (v !== undefined && v !== null && String(v).trim()) {
          memSlim[k] = v;
        }
      }
      if (Object.keys(memSlim).length) {
        slim.conversation_memory = memSlim;
      }
    }
    if (Object.keys(slim).length) {
      out.consultant_conversation_state = slim;
    }
  }

  const ip = asRecord(du.intent_persistence);
  if (ip) {
    const ipSlim: ConsultantConversationState = {};
    for (const k of ["active_tail", "active_aircraft", "response_mode", "effective_query"] as const) {
      const v = ip[k];
      if (v !== undefined && v !== null && String(v).trim()) {
        ipSlim[k] = v;
      }
    }
    if (Object.keys(ipSlim).length) {
      out.intent_persistence = ipSlim;
    }
  }

  const memTop = asRecord(du.conversation_memory);
  if (memTop?.active_tail) {
    out.active_tail = String(memTop.active_tail).trim().toUpperCase();
  }
  if (typeof du.active_tail === "string" && du.active_tail.trim()) {
    out.active_tail = du.active_tail.trim().toUpperCase();
  }
  if (typeof du.tail_registration === "string" && du.tail_registration.trim()) {
    out.tail_registration = du.tail_registration.trim().toUpperCase();
  }

  return Object.keys(out).length ? out : undefined;
}

export function pickConversationStateFromMessages(
  messages: Array<{ role: string; data_used?: Record<string, unknown> | null }>
): ConsultantConversationState | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "assistant") continue;
    const slim = slimConversationStateForStorage(m.data_used as Record<string, unknown> | undefined);
    if (slim) return slim;
  }
  return undefined;
}
