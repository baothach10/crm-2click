import type { PoolClient } from "pg";
import { withTransaction } from "../tx.js";
import type { HandoffDecision } from "../../handoff/types.js";

export interface HandoffStepInput {
  iteration: number;
  role: "preparer" | "checker";
  output: unknown;
}

export interface SaveHandoffRunInput {
  opportunityId: number;
  policyVersion: string;
  engine: string;
  inputSnapshot: unknown;
  iterations: number;
  decision: HandoffDecision;
  reason: string;
  steps: HandoffStepInput[];
}

// The run row and its per-role steps are written together, so a reader never sees a run
// with a decision but no steps to explain it (or vice versa).
export async function saveHandoffRun(input: SaveHandoffRunInput): Promise<number> {
  return withTransaction(async (client: PoolClient) => {
    const { rows } = await client.query<{ id: number }>(
      `INSERT INTO handoff_run
         (opportunity_id, policy_version, engine, input_snapshot, iterations, decision, reason)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6::handoff_decision, $7)
       RETURNING id`,
      [
        input.opportunityId,
        input.policyVersion,
        input.engine,
        JSON.stringify(input.inputSnapshot),
        input.iterations,
        input.decision,
        input.reason,
      ],
    );
    const runId = rows[0].id;

    for (const step of input.steps) {
      await client.query(
        `INSERT INTO handoff_run_step (run_id, iteration, role, output)
         VALUES ($1, $2, $3, $4::jsonb)`,
        [runId, step.iteration, step.role, JSON.stringify(step.output)],
      );
    }

    return runId;
  });
}
