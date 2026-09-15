import { pool } from "../pool.js";

export type FollowUpBucket = "overdue" | "today" | "next7" | "later";

export interface FollowUpScreenRow {
  bucket: FollowUpBucket;
  id: number;
  due_on: string;
  title: string;
  assigned_rep_name: string;
  company_code: string;
  company_name: string;
  opportunity_code: string | null;
}

const BUCKET_CASE = `
  CASE
    WHEN fu.due_on < ((now() AT TIME ZONE 'Europe/Rome')::date) THEN 'overdue'
    WHEN fu.due_on = ((now() AT TIME ZONE 'Europe/Rome')::date) THEN 'today'
    WHEN fu.due_on <= ((now() AT TIME ZONE 'Europe/Rome')::date) + 7 THEN 'next7'
    ELSE 'later'
  END
`;

const ROWS_PER_BUCKET = 50;

// Overdue/today/next-7-days are naturally bounded by the calendar; "later" is not, so it
// is capped like the others and the counts query tells the page how much is being hidden.
// A full keyset-paginated "later" bucket would be more machinery than a triage screen like
// this warrants -- the rep filter is the intended way to cut it down further.
export async function listFollowUpsForScreen(repId: number | null): Promise<FollowUpScreenRow[]> {
  const { rows } = await pool.query<FollowUpScreenRow>(
    `WITH base AS (
       SELECT fu.id, fu.due_on, fu.title, sr.display_name AS assigned_rep_name,
              co.company_code, co.name AS company_name, o.opportunity_code,
              ${BUCKET_CASE} AS bucket
       FROM follow_up fu
       JOIN sales_rep sr ON sr.id = fu.assigned_rep_id
       JOIN company co ON co.id = fu.company_id
       LEFT JOIN opportunity o ON o.id = fu.opportunity_id
       WHERE fu.completed_at IS NULL
         AND ($1::bigint IS NULL OR fu.assigned_rep_id = $1::bigint)
     )
     SELECT id, due_on, title, assigned_rep_name, company_code, company_name, opportunity_code, bucket
     FROM (
       SELECT *, row_number() OVER (PARTITION BY bucket ORDER BY due_on, id) AS rn
       FROM base
     ) ranked
     WHERE rn <= ${ROWS_PER_BUCKET}
     ORDER BY
       CASE bucket WHEN 'overdue' THEN 0 WHEN 'today' THEN 1 WHEN 'next7' THEN 2 ELSE 3 END,
       due_on, id`,
    [repId],
  );
  return rows;
}

export async function countFollowUpsByBucket(repId: number | null): Promise<Record<FollowUpBucket, number>> {
  const { rows } = await pool.query<{ bucket: FollowUpBucket; n: number }>(
    `SELECT ${BUCKET_CASE} AS bucket, count(*)::int AS n
     FROM follow_up fu
     WHERE fu.completed_at IS NULL
       AND ($1::bigint IS NULL OR fu.assigned_rep_id = $1::bigint)
     GROUP BY bucket`,
    [repId],
  );
  const result: Record<FollowUpBucket, number> = { overdue: 0, today: 0, next7: 0, later: 0 };
  for (const row of rows) {
    result[row.bucket] = row.n;
  }
  return result;
}
