import { pool } from "../pool.js";
import { ACTIVITY_PAGE_SIZE, type ActivityRow, type Cursor, type FollowUpRow } from "./company.js";

export interface OpportunityDetailRow {
  id: number;
  opportunity_code: string;
  description: string;
  status: string;
  legacy_status_raw: string;
  amount_eur: string;
  opened_on: string;
  expected_close_on: string | null;
  historical_campaign_code: string | null;
  stand_area_sqm: string | null;
  client_budget_eur: string | null;
  requested_height_m: string | null;
  brief_notes: string;
  created_at: Date;
  updated_at: Date;
  company_id: number;
  company_code: string;
  company_name: string;
  contact_id: number | null;
  contact_code: string | null;
  contact_first_name: string | null;
  contact_last_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  fair_edition_id: number;
  fair_id: number;
  fair_name: string;
  edition_code: string;
  city: string;
  venue: string;
  starts_on: string;
  ends_on: string;
  max_stand_height_m: string;
  height_exceeds_limit: boolean | null;
}

export async function getOpportunityByCode(code: string): Promise<OpportunityDetailRow | null> {
  const { rows } = await pool.query<OpportunityDetailRow>(
    `SELECT
       o.id, o.opportunity_code, o.description, o.status::text, o.legacy_status_raw,
       o.amount_eur, o.opened_on, o.expected_close_on, o.historical_campaign_code,
       o.stand_area_sqm, o.client_budget_eur, o.requested_height_m, o.brief_notes,
       o.created_at, o.updated_at,
       co.id AS company_id, co.company_code, co.name AS company_name,
       ct.id AS contact_id, ct.contact_code, ct.first_name AS contact_first_name,
       ct.last_name AS contact_last_name, ct.email AS contact_email, ct.phone AS contact_phone,
       fe.id AS fair_edition_id, f.id AS fair_id, f.name AS fair_name, fe.edition_code,
       fe.city, fe.venue, fe.starts_on, fe.ends_on, fe.max_stand_height_m,
       (o.requested_height_m > fe.max_stand_height_m) AS height_exceeds_limit
     FROM opportunity o
     JOIN company co ON co.id = o.company_id
     LEFT JOIN contact ct ON ct.id = o.contact_id
     JOIN fair_edition fe ON fe.id = o.fair_edition_id
     JOIN fair f ON f.id = fe.fair_id
     WHERE o.opportunity_code = $1`,
    [code],
  );
  return rows[0] ?? null;
}

export async function listOpportunityActivity(
  opportunityId: number,
  before: Cursor | null,
): Promise<ActivityRow[]> {
  const { rows } = await pool.query<ActivityRow>(
    `SELECT a.id, a.type::text, a.occurred_at, a.details, sr.display_name AS author_name,
            a.is_completed, o.opportunity_code
     FROM activity a
     JOIN sales_rep sr ON sr.id = a.author_rep_id
     LEFT JOIN opportunity o ON o.id = a.opportunity_id
     WHERE a.opportunity_id = $1
       AND ($2::timestamptz IS NULL OR (a.occurred_at, a.id) < ($2::timestamptz, $3::bigint))
     ORDER BY a.occurred_at DESC, a.id DESC
     LIMIT ${ACTIVITY_PAGE_SIZE}`,
    [opportunityId, before?.at ?? null, before?.id ?? null],
  );
  return rows;
}

export interface OtherEditionRow {
  opportunity_code: string;
  status: string;
  edition_code: string;
  starts_on: string;
  amount_eur: string;
  client_budget_eur: string | null;
}

export async function listOtherEditionsForFair(
  fairId: number,
  companyId: number,
  excludeOpportunityId: number,
): Promise<OtherEditionRow[]> {
  const { rows } = await pool.query<OtherEditionRow>(
    `SELECT o.opportunity_code, o.status::text, fe.edition_code, fe.starts_on,
            o.amount_eur, o.client_budget_eur
     FROM opportunity o
     JOIN fair_edition fe ON fe.id = o.fair_edition_id
     WHERE fe.fair_id = $1 AND o.company_id = $2 AND o.id <> $3
     ORDER BY fe.starts_on DESC`,
    [fairId, companyId, excludeOpportunityId],
  );
  return rows;
}

export async function listFollowUpsForOpportunity(opportunityId: number): Promise<FollowUpRow[]> {
  const { rows } = await pool.query<FollowUpRow>(
    `SELECT fu.id, fu.due_on, fu.title, sr.display_name AS assigned_rep_name,
            o.opportunity_code, fu.completed_at
     FROM follow_up fu
     JOIN sales_rep sr ON sr.id = fu.assigned_rep_id
     LEFT JOIN opportunity o ON o.id = fu.opportunity_id
     WHERE fu.opportunity_id = $1
     ORDER BY fu.completed_at IS NOT NULL, fu.due_on, fu.id
     LIMIT 100`,
    [opportunityId],
  );
  return rows;
}
