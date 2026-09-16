import { pool } from "../pool.js";

export interface HandoffRunSummary {
  id: number;
  created_at: Date;
  decision: string;
  reason: string;
  iterations: number;
}

export async function listHandoffRunsForOpportunity(opportunityId: number): Promise<HandoffRunSummary[]> {
  const { rows } = await pool.query<HandoffRunSummary>(
    `SELECT id, created_at, decision::text, reason, iterations
     FROM handoff_run
     WHERE opportunity_id = $1
     ORDER BY created_at DESC, id DESC`,
    [opportunityId],
  );
  return rows;
}

export interface HandoffRunDetail extends HandoffRunSummary {
  opportunity_code: string;
  policy_version: string;
  engine: string;
  input_snapshot: unknown;
}

export async function getHandoffRun(runId: number): Promise<HandoffRunDetail | null> {
  const { rows } = await pool.query<HandoffRunDetail>(
    `SELECT hr.id, hr.created_at, hr.decision::text, hr.reason, hr.iterations,
            hr.policy_version, hr.engine, hr.input_snapshot,
            o.opportunity_code
     FROM handoff_run hr
     JOIN opportunity o ON o.id = hr.opportunity_id
     WHERE hr.id = $1`,
    [runId],
  );
  return rows[0] ?? null;
}

export interface HandoffRunStepRow {
  iteration: number;
  role: string;
  output: unknown;
}

export async function getHandoffRunSteps(runId: number): Promise<HandoffRunStepRow[]> {
  const { rows } = await pool.query<HandoffRunStepRow>(
    `SELECT iteration, role, output
     FROM handoff_run_step
     WHERE run_id = $1
     ORDER BY iteration, id`,
    [runId],
  );
  return rows;
}
