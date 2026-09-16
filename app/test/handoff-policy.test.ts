// Pure unit tests: no DB, no network. Runs directly via `node --experimental-strip-types`
// against the .ts source -- these files only ever import *types* from sibling modules
// (e.g. policy.ts's `import type ... from "./types.js"`), and type-only imports are erased
// entirely by strip-types before Node's module resolver ever looks for that file, so there
// is nothing to resolve at runtime.
import assert from "node:assert/strict";
import test from "node:test";
import { authoritativeAssessment, shallowAssessment } from "../src/handoff/policy.ts";
import { renderBrief, renderRevisedBrief, renderReview } from "../src/handoff/deterministicStandIn.ts";
import type { HandoffContext } from "../src/handoff/types.ts";

const REFERENCE_DATE = "2026-09-16";

function makeContext(overrides: Partial<HandoffContext["opportunity"] & { ends_on: string }> = {}): HandoffContext {
  const { ends_on, ...opportunityOverrides } = overrides;
  return {
    opportunity: {
      code: "OP-TEST",
      description: "Test stand",
      status: "open",
      brief_notes: "Some notes.",
      amount_eur: "10000.00",
      client_budget_eur: "12000.00",
      stand_area_sqm: "50.00",
      requested_height_m: "4.00",
      opened_on: "2026-01-01",
      expected_close_on: null,
      ...opportunityOverrides,
    },
    company: { code: "CO-TEST", name: "Test Exhibitor" },
    contact: { code: "CO-TEST-P01", first_name: "Jamie", last_name: "Test" },
    fair_edition: {
      code: "TEST-2026",
      fair_name: "Test Fair",
      city: "Testville",
      venue: "Test Hall",
      starts_on: "2026-10-01",
      ends_on: ends_on ?? "2026-10-04",
      max_stand_height_m: "5.00",
    },
    recent_activity: [],
    reference_date: REFERENCE_DATE,
  };
}

test("authoritativeAssessment: complete and within limit -> ready_for_technical", () => {
  const ctx = makeContext();
  const result = authoritativeAssessment(ctx);
  assert.equal(result.decision, "ready_for_technical");
  assert.equal(result.heightExceedsLimit, false);
  assert.equal(result.editionEnded, false);
});

test("authoritativeAssessment: missing budget -> blocked_missing_info, takes priority over other gaps", () => {
  const ctx = makeContext({ client_budget_eur: null, stand_area_sqm: null, requested_height_m: null });
  const result = authoritativeAssessment(ctx);
  assert.equal(result.decision, "blocked_missing_info");
});

test("authoritativeAssessment: missing area only -> early_notice_only", () => {
  const ctx = makeContext({ stand_area_sqm: null });
  assert.equal(authoritativeAssessment(ctx).decision, "early_notice_only");
});

test("authoritativeAssessment: missing height only -> early_notice_only", () => {
  const ctx = makeContext({ requested_height_m: null });
  assert.equal(authoritativeAssessment(ctx).decision, "early_notice_only");
});

test("authoritativeAssessment: height exceeds limit -> blocked_conflict", () => {
  const ctx = makeContext({ requested_height_m: "6.00" }); // limit is 5.00
  const result = authoritativeAssessment(ctx);
  assert.equal(result.decision, "blocked_conflict");
  assert.equal(result.heightExceedsLimit, true);
});

test("authoritativeAssessment: height exactly at the limit -> ready_for_technical (<=, not <)", () => {
  const ctx = makeContext({ requested_height_m: "5.00" }); // limit is exactly 5.00
  const result = authoritativeAssessment(ctx);
  assert.equal(result.decision, "ready_for_technical");
  assert.equal(result.heightExceedsLimit, false);
});

test("authoritativeAssessment: edition already ended -> blocked_conflict", () => {
  const ctx = makeContext({ ends_on: "2026-01-01" }); // before reference_date
  const result = authoritativeAssessment(ctx);
  assert.equal(result.decision, "blocked_conflict");
  assert.equal(result.editionEnded, true);
});

test("shallowAssessment does not check height against the limit -- that's the checker's job", () => {
  const ctx = makeContext({ requested_height_m: "6.00" }); // exceeds the 5.00 limit
  const shallow = shallowAssessment(ctx);
  // The preparer sees budget+area+height all present and proposes ready_for_technical,
  // unaware of the conflict -- exactly the gap authoritativeAssessment exists to catch.
  assert.equal(shallow.decision, "ready_for_technical");
  assert.equal(authoritativeAssessment(ctx).decision, "blocked_conflict");
});

test("coordinator behaviour: preparer/checker mismatch produces a revise verdict, agreement produces approved", () => {
  const conflicting = makeContext({ requested_height_m: "6.00" });
  const shallowBad = shallowAssessment(conflicting);
  const briefBad = renderBrief(conflicting, shallowBad);
  const reviewBad = renderReview(conflicting, authoritativeAssessment(conflicting), briefBad);
  assert.equal(reviewBad.verdict, "revise");
  assert.equal(reviewBad.decision, "blocked_conflict");

  const revised = renderRevisedBrief(conflicting, authoritativeAssessment(conflicting));
  const finalReview = renderReview(conflicting, authoritativeAssessment(conflicting), revised);
  assert.equal(finalReview.verdict, "approved");

  const clean = makeContext();
  const briefClean = renderBrief(clean, shallowAssessment(clean));
  const reviewClean = renderReview(clean, authoritativeAssessment(clean), briefClean);
  assert.equal(reviewClean.verdict, "approved");
});

test("determinism: identical input produces byte-identical brief and review output", () => {
  const ctx = makeContext({ requested_height_m: "6.00" });
  const shallow = shallowAssessment(ctx);
  const authoritative = authoritativeAssessment(ctx);

  const brief1 = renderBrief(ctx, shallow);
  const brief2 = renderBrief(ctx, shallowAssessment(ctx));
  assert.equal(JSON.stringify(brief1), JSON.stringify(brief2));

  const review1 = renderReview(ctx, authoritative, brief1);
  const review2 = renderReview(ctx, authoritativeAssessment(ctx), brief2);
  assert.equal(JSON.stringify(review1), JSON.stringify(review2));
});
