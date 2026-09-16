import type { HandoffContext, HandoffDecision } from "./types.js";

// Pure decision logic, deliberately free of prose -- deterministicStandIn.ts turns these
// results into the sentences a person reads. Keeping the two apart means the actual rule
// (what decision, and why) can be tested and reasoned about without string-matching, and
// the "model" text can change without touching the policy.

export interface ShallowResult {
  decision: HandoffDecision;
  missingFields: string[];
}

// The sales-side pass: is a fair known (always true -- an opportunity can't exist without
// one), is a budget known, are area and height known. It does NOT check the requested
// height against the edition's limit. That is intentional: the assignment's whole
// disagreement is that sales wants to move as soon as numbers exist, while technical wants
// those numbers actually checked against the fair before work starts. Encoding that gap
// directly into what each role is capable of seeing is what makes the checker's job real
// rather than a rubber stamp on an already-correct answer.
export function shallowAssessment(ctx: HandoffContext): ShallowResult {
  const missingFields: string[] = [];
  if (ctx.opportunity.client_budget_eur === null) missingFields.push("client_budget_eur");
  if (ctx.opportunity.stand_area_sqm === null) missingFields.push("stand_area_sqm");
  if (ctx.opportunity.requested_height_m === null) missingFields.push("requested_height_m");

  if (ctx.opportunity.client_budget_eur === null) {
    return { decision: "blocked_missing_info", missingFields };
  }
  if (ctx.opportunity.stand_area_sqm === null || ctx.opportunity.requested_height_m === null) {
    return { decision: "early_notice_only", missingFields };
  }
  return { decision: "ready_for_technical", missingFields };
}

export interface AuthoritativeResult {
  decision: HandoffDecision;
  budgetKnown: boolean;
  areaKnown: boolean;
  heightKnown: boolean;
  heightExceedsLimit: boolean;
  editionEnded: boolean;
}

// The technical-side pass: the same presence checks, plus the two checks the assignment
// says must gate real work -- the requested height against the edition's recorded limit
// (<=, not <: 1210 opportunities in the archive request exactly the limit), and that the
// edition hasn't already concluded. This is the only source of truth the checker trusts;
// it never reads the preparer's proposed decision, only ctx.
export function authoritativeAssessment(ctx: HandoffContext): AuthoritativeResult {
  const { opportunity: o, fair_edition: fe, reference_date } = ctx;
  const budgetKnown = o.client_budget_eur !== null;
  const areaKnown = o.stand_area_sqm !== null;
  const heightKnown = o.requested_height_m !== null;
  const heightExceedsLimit = heightKnown && Number(o.requested_height_m) > Number(fe.max_stand_height_m);
  const editionEnded = fe.ends_on < reference_date;

  let decision: HandoffDecision;
  if (!budgetKnown) {
    decision = "blocked_missing_info";
  } else if (!areaKnown || !heightKnown) {
    decision = "early_notice_only";
  } else if (heightExceedsLimit || editionEnded) {
    decision = "blocked_conflict";
  } else {
    decision = "ready_for_technical";
  }

  return { decision, budgetKnown, areaKnown, heightKnown, heightExceedsLimit, editionEnded };
}
