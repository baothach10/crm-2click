import { pool } from "../pool.js";

export interface CreateFollowUpInput {
  companyId: number;
  opportunityId: number | null;
  dueOn: string;
  title: string;
  assignedRepId: number;
}

export async function createFollowUp(input: CreateFollowUpInput): Promise<void> {
  await pool.query(
    `INSERT INTO follow_up (company_id, opportunity_id, due_on, title, assigned_rep_id)
     VALUES ($1, $2, $3::date, $4, $5)`,
    [input.companyId, input.opportunityId, input.dueOn, input.title, input.assignedRepId],
  );
}

export async function completeFollowUp(id: number): Promise<void> {
  await pool.query(
    "UPDATE follow_up SET completed_at = now() WHERE id = $1 AND completed_at IS NULL",
    [id],
  );
}

export async function rescheduleFollowUp(id: number, dueOn: string): Promise<void> {
  await pool.query("UPDATE follow_up SET due_on = $2::date WHERE id = $1", [id, dueOn]);
}
