export type HandoffDecision =
  | "ready_for_technical"
  | "early_notice_only"
  | "blocked_missing_info"
  | "blocked_conflict";

// Everything the assistant used, frozen at run time -- the whole point of persisting this
// verbatim is that a past run stays readable even after the opportunity is edited later.
export interface HandoffContext {
  opportunity: {
    code: string;
    description: string;
    status: string;
    brief_notes: string;
    amount_eur: string;
    client_budget_eur: string | null;
    stand_area_sqm: string | null;
    requested_height_m: string | null;
    opened_on: string;
    expected_close_on: string | null;
  };
  company: {
    code: string;
    name: string;
  };
  contact: {
    code: string;
    first_name: string;
    last_name: string;
  } | null;
  fair_edition: {
    code: string;
    fair_name: string;
    city: string;
    venue: string;
    starts_on: string;
    ends_on: string;
    max_stand_height_m: string;
  };
  recent_activity: Array<{
    type: string;
    occurred_at: string;
    details: string;
  }>;
  // "Today" in Europe/Rome, captured once at gather time so the edition-ended check is
  // reproducible from the stored snapshot alone, without depending on wall-clock time.
  reference_date: string;
}

export interface Finding {
  severity: "blocker" | "info";
  code: string;
  message: string;
}

// The preparer's output: a fast pass over presence/absence of the required fields. It
// deliberately does not cross-check the requested height against the edition's limit --
// that check belongs to the checker (see policy.ts for why).
export interface Brief {
  role: "preparer";
  decision: HandoffDecision;
  missing_fields: string[];
  proposed_next_step: string;
  note?: string;
}

// The checker's output: the authoritative recomputation from the same snapshot, including
// the height-vs-limit and edition-still-open checks the preparer skips.
export interface Review {
  role: "checker";
  decision: HandoffDecision;
  verdict: "approved" | "revise";
  findings: Finding[];
}
