import type { PoolClient } from "pg";
import { withTransaction } from "../tx.js";

export interface LogActivityInput {
  companyId: number;
  opportunityId: number | null;
  type: "call" | "email" | "meeting" | "note" | "task";
  details: string;
  authorRepId: number;
  followUpOn: string | null;
}

// Mirrors the import's own derivation: a completed call/email/meeting records contact, a
// task is pending work, a note is internal and neither. An optional follow-up date creates
// a linked follow_up in the same transaction, same as 08_follow_up_from_activity.sql does
// for imported rows.
export async function logActivity(input: LogActivityInput): Promise<void> {
  await withTransaction(async (client: PoolClient) => {
    const isCompleted = input.type === "note" ? null : input.type !== "task";
    const { rows } = await client.query<{ id: number }>(
      `INSERT INTO activity (company_id, opportunity_id, type, occurred_at, details, author_rep_id, is_completed)
       VALUES ($1, $2, $3::activity_type, now(), $4, $5, $6)
       RETURNING id`,
      [input.companyId, input.opportunityId, input.type, input.details, input.authorRepId, isCompleted],
    );
    const activityId = rows[0].id;

    if (input.followUpOn) {
      await client.query(
        `INSERT INTO follow_up (company_id, opportunity_id, due_on, title, assigned_rep_id, source_activity_id)
         VALUES ($1, $2, $3::date, $4, $5, $6)`,
        [
          input.companyId,
          input.opportunityId,
          input.followUpOn,
          input.details.slice(0, 140),
          input.authorRepId,
          activityId,
        ],
      );
    }
  });
}
