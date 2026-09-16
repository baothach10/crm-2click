import { pool } from "../db/pool.js";
import type { HandoffContext } from "./types.js";

interface GatherRow {
  opportunity_code: string;
  description: string;
  status: string;
  brief_notes: string;
  amount_eur: string;
  client_budget_eur: string | null;
  stand_area_sqm: string | null;
  requested_height_m: string | null;
  opened_on: string;
  expected_close_on: string | null;
  company_code: string;
  company_name: string;
  contact_code: string | null;
  contact_first_name: string | null;
  contact_last_name: string | null;
  edition_code: string;
  fair_name: string;
  city: string;
  venue: string;
  starts_on: string;
  ends_on: string;
  max_stand_height_m: string;
}

interface RecentActivityRow {
  type: string;
  occurred_at: Date;
  details: string;
}

const RECENT_ACTIVITY_LIMIT = 5;

// Only this opportunity's own activity -- the assistant works within the same edition
// scoping as the rest of the app, never pulling in another year's conversations.
export async function gatherContext(opportunityId: number): Promise<HandoffContext | null> {
  const { rows } = await pool.query<GatherRow>(
    `SELECT
       o.opportunity_code, o.description, o.status::text, o.brief_notes, o.amount_eur,
       o.client_budget_eur, o.stand_area_sqm, o.requested_height_m, o.opened_on, o.expected_close_on,
       co.company_code, co.name AS company_name,
       ct.contact_code, ct.first_name AS contact_first_name, ct.last_name AS contact_last_name,
       fe.edition_code, f.name AS fair_name, fe.city, fe.venue, fe.starts_on, fe.ends_on, fe.max_stand_height_m
     FROM opportunity o
     JOIN company co ON co.id = o.company_id
     LEFT JOIN contact ct ON ct.id = o.contact_id
     JOIN fair_edition fe ON fe.id = o.fair_edition_id
     JOIN fair f ON f.id = fe.fair_id
     WHERE o.id = $1`,
    [opportunityId],
  );
  const row = rows[0];
  if (!row) return null;

  const { rows: activityRows } = await pool.query<RecentActivityRow>(
    `SELECT type::text, occurred_at, details
     FROM activity
     WHERE opportunity_id = $1
     ORDER BY occurred_at DESC, id DESC
     LIMIT ${RECENT_ACTIVITY_LIMIT}`,
    [opportunityId],
  );

  const { rows: refRows } = await pool.query<{ today: string }>(
    "SELECT ((now() AT TIME ZONE 'Europe/Rome')::date)::text AS today",
  );

  return {
    opportunity: {
      code: row.opportunity_code,
      description: row.description,
      status: row.status,
      brief_notes: row.brief_notes,
      amount_eur: row.amount_eur,
      client_budget_eur: row.client_budget_eur,
      stand_area_sqm: row.stand_area_sqm,
      requested_height_m: row.requested_height_m,
      opened_on: row.opened_on,
      expected_close_on: row.expected_close_on,
    },
    company: { code: row.company_code, name: row.company_name },
    contact:
      row.contact_code && row.contact_first_name && row.contact_last_name
        ? { code: row.contact_code, first_name: row.contact_first_name, last_name: row.contact_last_name }
        : null,
    fair_edition: {
      code: row.edition_code,
      fair_name: row.fair_name,
      city: row.city,
      venue: row.venue,
      starts_on: row.starts_on,
      ends_on: row.ends_on,
      max_stand_height_m: row.max_stand_height_m,
    },
    recent_activity: activityRows.map((a) => ({
      type: a.type,
      occurred_at: a.occurred_at.toISOString(),
      details: a.details,
    })),
    reference_date: refRows[0].today,
  };
}
