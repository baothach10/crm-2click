import { pool } from "../pool.js";

export interface DueFollowUpRow {
  id: number;
  due_on: string;
  title: string;
  assigned_rep_name: string;
  company_code: string;
  company_name: string;
  opportunity_code: string | null;
}

// Overdue and due-today follow-ups, using the open-queue partial index (due_on, id).
export async function listDueFollowUps(limit = 50): Promise<DueFollowUpRow[]> {
  const { rows } = await pool.query<DueFollowUpRow>(
    `SELECT fu.id, fu.due_on, fu.title, sr.display_name AS assigned_rep_name,
            co.company_code, co.name AS company_name, o.opportunity_code
     FROM follow_up fu
     JOIN sales_rep sr ON sr.id = fu.assigned_rep_id
     JOIN company co ON co.id = fu.company_id
     LEFT JOIN opportunity o ON o.id = fu.opportunity_id
     WHERE fu.completed_at IS NULL
       AND fu.due_on <= ((now() AT TIME ZONE 'Europe/Rome')::date)
     ORDER BY fu.due_on, fu.id
     LIMIT $1`,
    [limit],
  );
  return rows;
}
