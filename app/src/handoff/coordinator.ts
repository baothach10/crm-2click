import { saveHandoffRun, type HandoffStepInput } from "../db/writes/handoff.js";
import { ENGINE_LABEL, POLICY_VERSION, renderBrief, renderReview, renderRevisedBrief } from "./deterministicStandIn.js";
import { gatherContext } from "./gather.js";
import { authoritativeAssessment, shallowAssessment } from "./policy.js";

const MAX_ITERATIONS = 2;

export class OpportunityNotFoundError extends Error {}

// gather -> preparer -> checker -> (at most one revision) -> persist. Never loops: the
// iteration cap is structural, not a retry budget, because both roles are pure functions
// of the same frozen snapshot -- there is nothing further discussion of the same facts
// could change.
export async function runHandoffAssistant(opportunityId: number): Promise<number> {
  const ctx = await gatherContext(opportunityId);
  if (!ctx) {
    throw new OpportunityNotFoundError(`Opportunity ${opportunityId} not found`);
  }

  const steps: HandoffStepInput[] = [];

  const shallow = shallowAssessment(ctx);
  const brief = renderBrief(ctx, shallow);
  steps.push({ iteration: 1, role: "preparer", output: brief });

  const authoritative = authoritativeAssessment(ctx);
  let review = renderReview(ctx, authoritative, brief);
  steps.push({ iteration: 1, role: "checker", output: review });

  let iterations = 1;

  if (review.verdict === "revise" && iterations < MAX_ITERATIONS) {
    iterations = 2;
    const revisedBrief = renderRevisedBrief(ctx, authoritative);
    steps.push({ iteration: 2, role: "preparer", output: revisedBrief });

    review = renderReview(ctx, authoritative, revisedBrief);
    steps.push({ iteration: 2, role: "checker", output: review });
  }

  const reason =
    iterations === 1
      ? `Approved on the first pass: ${review.findings.map((f) => f.message).join(" ")}`
      : `Revised after the checker's first pass found a condition the preparer had not checked: ` +
        `${review.findings.map((f) => f.message).join(" ")}`;

  return saveHandoffRun({
    opportunityId,
    policyVersion: POLICY_VERSION,
    engine: ENGINE_LABEL,
    inputSnapshot: ctx,
    iterations,
    decision: review.decision,
    reason,
    steps,
  });
}
