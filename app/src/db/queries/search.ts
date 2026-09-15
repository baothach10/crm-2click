import { pool } from "../pool.js";

const RESULT_LIMIT = 25;

export interface CompanyMatch {
  company_code: string;
  name: string;
  province_code: string;
  region: string;
}

// word_similarity/<% (not plain similarity/%): a search box query like "aster" is short
// relative to the full name "Aster Cosmetics S.r.l.", and plain similarity() normalises by
// the combined trigram count of BOTH strings, so a short query against a long name often
// falls under the 0.3 default threshold even for a perfect substring match. word_similarity
// asks "does some substring of the name match the query well", which is what a search box
// needs. Still indexable: company_name_trgm_idx backs it via its commutator (%>).
export async function searchCompanies(q: string): Promise<CompanyMatch[]> {
  const { rows } = await pool.query<CompanyMatch>(
    `SELECT company_code, name, province_code, region
     FROM company
     WHERE lower(immutable_unaccent($1)) <% lower(immutable_unaccent(name))
     ORDER BY word_similarity(lower(immutable_unaccent($1)), lower(immutable_unaccent(name))) DESC, id
     LIMIT ${RESULT_LIMIT}`,
    [q],
  );
  return rows;
}

export interface ContactMatch {
  contact_code: string;
  first_name: string;
  last_name: string;
  email: string | null;
  company_code: string;
  company_name: string;
}

export async function searchContacts(q: string): Promise<ContactMatch[]> {
  const { rows } = await pool.query<ContactMatch>(
    `SELECT ct.contact_code, ct.first_name, ct.last_name, ct.email,
            co.company_code, co.name AS company_name
     FROM contact ct
     JOIN company co ON co.id = ct.company_id
     WHERE lower(immutable_unaccent($1)) <% lower(immutable_unaccent(ct.first_name || ' ' || ct.last_name))
        OR lower($1) <% lower(ct.email)
     ORDER BY word_similarity(lower(immutable_unaccent($1)), lower(immutable_unaccent(ct.first_name || ' ' || ct.last_name))) DESC,
              ct.id
     LIMIT ${RESULT_LIMIT}`,
    [q],
  );
  return rows;
}

export async function findCompanyCodeExact(q: string): Promise<string | null> {
  const { rows } = await pool.query<{ company_code: string }>(
    "SELECT company_code FROM company WHERE company_code = $1",
    [q],
  );
  return rows[0]?.company_code ?? null;
}

export async function findOpportunityCodeExact(q: string): Promise<string | null> {
  const { rows } = await pool.query<{ opportunity_code: string }>(
    "SELECT opportunity_code FROM opportunity WHERE opportunity_code = $1",
    [q],
  );
  return rows[0]?.opportunity_code ?? null;
}

// A contact has no page of its own; an exact contact-code match resolves to its company.
export async function findCompanyCodeByContactCodeExact(q: string): Promise<string | null> {
  const { rows } = await pool.query<{ company_code: string }>(
    `SELECT co.company_code
     FROM contact ct
     JOIN company co ON co.id = ct.company_id
     WHERE ct.contact_code = $1`,
    [q],
  );
  return rows[0]?.company_code ?? null;
}
