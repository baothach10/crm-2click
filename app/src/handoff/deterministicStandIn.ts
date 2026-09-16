import type { AuthoritativeResult, ShallowResult } from "./policy.js";
import type { Brief, Finding, HandoffContext, Review } from "./types.js";

// Labelled per the assignment's requirement: this is a deterministic, seedless,
// rule-and-template renderer, not a model call. Same input -> byte-identical output.
// No network access, no API keys, nothing downloaded.
export const ENGINE_LABEL = "deterministic-stand-in@1";
export const POLICY_VERSION = "handoff-policy@1";

const FIELD_LABELS: Record<string, string> = {
  client_budget_eur: "client budget",
  stand_area_sqm: "stand area",
  requested_height_m: "requested height",
};

function contactName(ctx: HandoffContext): string {
  return ctx.contact ? `${ctx.contact.first_name} ${ctx.contact.last_name}` : "the customer";
}

function listFields(fields: string[]): string {
  return fields.map((f) => FIELD_LABELS[f] ?? f).join(" and ");
}

export function renderBrief(ctx: HandoffContext, shallow: ShallowResult): Brief {
  const { opportunity: o, fair_edition: fe } = ctx;
  let proposed_next_step: string;

  switch (shallow.decision) {
    case "blocked_missing_info":
      proposed_next_step =
        `Ask ${contactName(ctx)} to confirm the stand budget for ${fe.fair_name} ${fe.code} ` +
        "before this moves any further toward technical.";
      break;
    case "early_notice_only":
      proposed_next_step =
        `Give technical early notice of this enquiry for ${fe.fair_name} ${fe.code} ` +
        `(client budget €${o.client_budget_eur}) so they have capacity awareness; do not start ` +
        `design work yet. Follow up with ${contactName(ctx)} for: ${listFields(shallow.missingFields)}.`;
      break;
    case "ready_for_technical":
    default:
      proposed_next_step =
        `Hand off to technical: client budget (€${o.client_budget_eur}), stand area ` +
        `(${o.stand_area_sqm} m²) and requested height (${o.requested_height_m} m) are all ` +
        `recorded for ${fe.code}.`;
      break;
  }

  return {
    role: "preparer",
    decision: shallow.decision,
    missing_fields: shallow.missingFields,
    proposed_next_step,
  };
}

export function renderReview(ctx: HandoffContext, authoritative: AuthoritativeResult, brief: Brief): Review {
  const { opportunity: o, fair_edition: fe } = ctx;
  const findings: Finding[] = [];

  if (!authoritative.budgetKnown) {
    findings.push({ severity: "blocker", code: "missing_budget", message: "Client budget is not recorded." });
  } else {
    findings.push({
      severity: "info",
      code: "budget_present",
      message: `Client budget recorded: €${o.client_budget_eur}.`,
    });
  }

  if (authoritative.budgetKnown && (!authoritative.areaKnown || !authoritative.heightKnown)) {
    const missing = [
      !authoritative.areaKnown ? "stand area" : null,
      !authoritative.heightKnown ? "requested height" : null,
    ].filter((v): v is string => v !== null);
    findings.push({
      severity: "blocker",
      code: "missing_dimensions",
      message: `Missing: ${missing.join(" and ")}.`,
    });
  }

  if (authoritative.areaKnown && authoritative.heightKnown) {
    findings.push({
      severity: "info",
      code: "dimensions_present",
      message: `Stand area ${o.stand_area_sqm} m², requested height ${o.requested_height_m} m.`,
    });

    if (authoritative.heightExceedsLimit) {
      const diff = (Number(o.requested_height_m) - Number(fe.max_stand_height_m)).toFixed(2);
      findings.push({
        severity: "blocker",
        code: "height_exceeds_limit",
        message:
          `Requested height ${o.requested_height_m} m exceeds ${fe.code}'s ${fe.max_stand_height_m} m ` +
          `limit by ${diff} m, and no exception is recorded.`,
      });
    } else {
      findings.push({
        severity: "info",
        code: "height_within_limit",
        message: `Requested height ${o.requested_height_m} m is within ${fe.code}'s ${fe.max_stand_height_m} m limit.`,
      });
    }
  }

  if (authoritative.editionEnded) {
    findings.push({
      severity: "blocker",
      code: "edition_ended",
      message: `${fe.fair_name} ${fe.code} concluded on ${fe.ends_on} (as of ${ctx.reference_date}).`,
    });
  }

  const verdict = authoritative.decision === brief.decision ? "approved" : "revise";
  if (verdict === "revise") {
    findings.unshift({
      severity: "blocker",
      code: "proposal_mismatch",
      message:
        `The preparer proposed "${brief.decision}" based on which fields are present, but did not check ` +
        `the requested height against the edition limit or whether the edition has ended. That check changes ` +
        `the outcome to "${authoritative.decision}".`,
    });
  }

  return { role: "checker", decision: authoritative.decision, verdict, findings };
}

// Only called for the one allowed revision, and only when the checker disagreed -- which,
// given how shallowAssessment and authoritativeAssessment are structured, can only happen
// when the preparer proposed ready_for_technical without having checked the height-vs-limit
// or edition-ended conditions the checker just found a problem with.
export function renderRevisedBrief(ctx: HandoffContext, authoritative: AuthoritativeResult): Brief {
  const { opportunity: o, fair_edition: fe } = ctx;
  let proposed_next_step: string;

  if (authoritative.heightExceedsLimit) {
    const diff = (Number(o.requested_height_m) - Number(fe.max_stand_height_m)).toFixed(2);
    proposed_next_step =
      `Do not hand off. Requested height ${o.requested_height_m} m exceeds ${fe.code}'s ` +
      `${fe.max_stand_height_m} m limit by ${diff} m. Obtain a written exception from the organiser, or a ` +
      `revised height from ${contactName(ctx)}, before proceeding.`;
  } else if (authoritative.editionEnded) {
    proposed_next_step =
      `Do not hand off. ${fe.fair_name} ${fe.code} concluded on ${fe.ends_on}; this opportunity cannot ` +
      "proceed to a technical handoff for that edition.";
  } else {
    // Not reachable given the current policy (see the module comment above), but a
    // deterministic fallback is safer than an unhandled case if the policy ever grows.
    proposed_next_step = `Revised assessment: ${authoritative.decision}.`;
  }

  return {
    role: "preparer",
    decision: authoritative.decision,
    missing_fields: [],
    proposed_next_step,
    note: "Revised after the checker found a condition the first pass did not check against the fair information.",
  };
}
