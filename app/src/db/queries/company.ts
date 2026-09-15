import { pool } from "../pool.js";

export interface CompanyRow {
  id: number;
  company_code: string;
  name: string;
  province_code: string;
  region: string;
  owner_rep_name: string;
}

export async function getCompanyByCode(code: string): Promise<CompanyRow | null> {
  const { rows } = await pool.query<CompanyRow>(
    `SELECT c.id, c.company_code, c.name, c.province_code, c.region, sr.display_name AS owner_rep_name
     FROM company c
     JOIN sales_rep sr ON sr.id = c.owner_rep_id
     WHERE c.company_code = $1`,
    [code],
  );
  return rows[0] ?? null;
}

export interface ContactRow {
  id: number;
  contact_code: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  fax: string | null;
}

export async function listContactsForCompany(companyId: number): Promise<ContactRow[]> {
  const { rows } = await pool.query<ContactRow>(
    `SELECT id, contact_code, first_name, last_name, email, phone, fax
     FROM contact
     WHERE company_id = $1
     ORDER BY last_name, first_name
     LIMIT 100`,
    [companyId],
  );
  return rows;
}

export interface CompanyOpportunityRow {
  opportunity_code: string;
  description: string;
  status: string;
  amount_eur: string;
  opened_on: string;
  fair_name: string;
  edition_code: string;
  starts_on: string;
}

export async function listOpportunitiesForCompany(companyId: number): Promise<CompanyOpportunityRow[]> {
  const { rows } = await pool.query<CompanyOpportunityRow>(
    `SELECT o.opportunity_code, o.description, o.status::text, o.amount_eur, o.opened_on,
            f.name AS fair_name, fe.edition_code, fe.starts_on
     FROM opportunity o
     JOIN fair_edition fe ON fe.id = o.fair_edition_id
     JOIN fair f ON f.id = fe.fair_id
     WHERE o.company_id = $1
     ORDER BY f.name, fe.starts_on DESC
     LIMIT 200`,
    [companyId],
  );
  return rows;
}

export interface ActivityRow {
  id: number;
  type: string;
  occurred_at: Date;
  details: string;
  author_name: string;
  is_completed: boolean | null;
  opportunity_code: string | null;
}

export const ACTIVITY_PAGE_SIZE = 20;

export interface Cursor {
  at: string;
  id: number;
}

export async function listCompanyActivity(
  companyId: number,
  before: Cursor | null,
): Promise<ActivityRow[]> {
  const { rows } = await pool.query<ActivityRow>(
    `SELECT a.id, a.type::text, a.occurred_at, a.details, sr.display_name AS author_name,
            a.is_completed, o.opportunity_code
     FROM activity a
     JOIN sales_rep sr ON sr.id = a.author_rep_id
     LEFT JOIN opportunity o ON o.id = a.opportunity_id
     WHERE a.company_id = $1
       AND ($2::timestamptz IS NULL OR (a.occurred_at, a.id) < ($2::timestamptz, $3::bigint))
     ORDER BY a.occurred_at DESC, a.id DESC
     LIMIT ${ACTIVITY_PAGE_SIZE}`,
    [companyId, before?.at ?? null, before?.id ?? null],
  );
  return rows;
}

export interface FollowUpRow {
  id: number;
  due_on: string;
  title: string;
  assigned_rep_name: string;
  opportunity_code: string | null;
  completed_at: Date | null;
}

export async function listOpenFollowUpsForCompany(companyId: number): Promise<FollowUpRow[]> {
  const { rows } = await pool.query<FollowUpRow>(
    `SELECT fu.id, fu.due_on, fu.title, sr.display_name AS assigned_rep_name,
            o.opportunity_code, fu.completed_at
     FROM follow_up fu
     JOIN sales_rep sr ON sr.id = fu.assigned_rep_id
     LEFT JOIN opportunity o ON o.id = fu.opportunity_id
     WHERE fu.company_id = $1 AND fu.completed_at IS NULL
     ORDER BY fu.due_on, fu.id
     LIMIT 100`,
    [companyId],
  );
  return rows;
}
