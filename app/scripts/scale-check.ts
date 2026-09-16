// Manual, throwaway benchmark -- NOT part of dev.sh, NOT part of the test suite, and never
// touches the real imported archive in the `public` schema. Run it explicitly:
//
//   docker compose --profile test run --rm test node --experimental-strip-types scripts/scale-check.ts
//
// It clones the already-imported archive five times over into a separate `scale_check`
// schema in the same database (companies/contacts/opportunities/activities/follow-ups get
// a "-G<n>" suffix on their codes so they coexist; sales_rep/fair/fair_edition are shared
// reference data and are copied once, verbatim, with their original ids preserved), then
// runs EXPLAIN (ANALYZE, BUFFERS) on the five real page queries against that ~5x dataset --
// evidence that the design in ASSIGNMENT.md's "grow to 100,000 contacts" requirement holds,
// without generating a single row inside the actual import path. A schema is used instead
// of a second database: same isolation (a plain `DROP SCHEMA scale_check CASCADE` or a
// `./reset.sh` removes it and nothing else), simpler to populate from data already sitting
// in the same server.
//
// This is intentionally a self-contained script, not an import of this project's own
// src/db/queries/*.ts modules: those modules assume a compiled dist/ layout, and pulling
// them in here would tie a one-off benchmark's correctness to how it happens to be invoked.
// The five queries below are copied verbatim from where the comment above each one says --
// keep them in sync if those files change.
import { Client } from "pg";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SELF_DIR = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(SELF_DIR, "..", "src", "migrations");
const GENERATIONS = 5; // 5x the shipped archive, per PLAN.md's ~100k-contact target

function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return url;
}

async function main(): Promise<void> {
  const client = new Client({ connectionString: databaseUrl() });
  await client.connect();

  try {
    console.log("[scale-check] creating scale_check schema...");
    await client.query("DROP SCHEMA IF EXISTS scale_check CASCADE");
    await client.query("CREATE SCHEMA scale_check");
    // Everything below this point -- migrations and clone inserts alike -- targets
    // scale_check first. Explicit `public.` references (the clone SELECTs' source side)
    // are unaffected by search_path and keep reading the real imported data.
    await client.query("SET search_path TO scale_check, public");

    console.log("[scale-check] recreating the domain schema inside scale_check...");
    const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();
    for (const file of files) {
      if (file === "0001_init.sql") continue; // extensions already exist database-wide
      const sql = await readFile(path.join(MIGRATIONS_DIR, file), "utf8");
      await client.query(sql);
    }

    console.log("[scale-check] copying reference data (sales_rep, fair, fair_edition)...");
    await client.query(
      "INSERT INTO sales_rep OVERRIDING SYSTEM VALUE SELECT * FROM public.sales_rep",
    );
    await client.query("INSERT INTO fair OVERRIDING SYSTEM VALUE SELECT * FROM public.fair");
    await client.query(
      "INSERT INTO fair_edition OVERRIDING SYSTEM VALUE SELECT * FROM public.fair_edition",
    );

    for (let g = 1; g <= GENERATIONS; g++) {
      console.log(`[scale-check] cloning generation ${g}/${GENERATIONS}...`);

      await client.query(
        `INSERT INTO company (company_code, name, province_code, region, owner_rep_id)
         SELECT company_code || '-G' || $1::text, name, province_code, region, owner_rep_id
         FROM public.company`,
        [g],
      );

      await client.query(
        `INSERT INTO contact (contact_code, company_id, legacy_row_id, first_name, last_name, email, phone, fax)
         SELECT ct.contact_code || '-G' || $1::text, newco.id, ct.legacy_row_id || '-G' || $1::text,
                ct.first_name, ct.last_name, ct.email, ct.phone, ct.fax
         FROM public.contact ct
         JOIN public.company oldco ON oldco.id = ct.company_id
         JOIN company newco ON newco.company_code = oldco.company_code || '-G' || $1::text`,
        [g],
      );

      await client.query(
        `INSERT INTO opportunity (
           opportunity_code, company_id, contact_id, fair_edition_id, description, amount_eur,
           status, legacy_status_raw, opened_on, expected_close_on, historical_campaign_code,
           stand_area_sqm, client_budget_eur, requested_height_m, brief_notes
         )
         SELECT o.opportunity_code || '-G' || $1::text, newco.id, newct.id, o.fair_edition_id,
                o.description, o.amount_eur, o.status::text::opportunity_status, o.legacy_status_raw, o.opened_on,
                o.expected_close_on, o.historical_campaign_code, o.stand_area_sqm,
                o.client_budget_eur, o.requested_height_m, o.brief_notes
         FROM public.opportunity o
         JOIN public.company oldco ON oldco.id = o.company_id
         JOIN company newco ON newco.company_code = oldco.company_code || '-G' || $1::text
         LEFT JOIN public.contact oldct ON oldct.id = o.contact_id
         LEFT JOIN contact newct ON newct.contact_code = oldct.contact_code || '-G' || $1::text`,
        [g],
      );

      await client.query(
        `INSERT INTO activity (legacy_entry_id, company_id, opportunity_id, type, occurred_at, details, author_rep_id, is_completed)
         SELECT a.legacy_entry_id || '-G' || $1::text, newco.id, newop.id, a.type::text::activity_type, a.occurred_at,
                a.details, a.author_rep_id, a.is_completed
         FROM public.activity a
         JOIN public.company oldco ON oldco.id = a.company_id
         JOIN company newco ON newco.company_code = oldco.company_code || '-G' || $1::text
         LEFT JOIN public.opportunity oldop ON oldop.id = a.opportunity_id
         LEFT JOIN opportunity newop ON newop.opportunity_code = oldop.opportunity_code || '-G' || $1::text`,
        [g],
      );

      await client.query(
        `INSERT INTO follow_up (company_id, opportunity_id, due_on, title, assigned_rep_id, source_activity_id, completed_at)
         SELECT newco.id, newop.id, fu.due_on, fu.title, fu.assigned_rep_id, newact.id, fu.completed_at
         FROM public.follow_up fu
         JOIN public.company oldco ON oldco.id = fu.company_id
         JOIN company newco ON newco.company_code = oldco.company_code || '-G' || $1::text
         LEFT JOIN public.opportunity oldop ON oldop.id = fu.opportunity_id
         LEFT JOIN opportunity newop ON newop.opportunity_code = oldop.opportunity_code || '-G' || $1::text
         LEFT JOIN public.activity olda ON olda.id = fu.source_activity_id
         LEFT JOIN activity newact ON newact.legacy_entry_id = olda.legacy_entry_id || '-G' || $1::text`,
        [g],
      );
    }

    console.log("[scale-check] analyzing...");
    await client.query(
      "ANALYZE company, contact, opportunity, activity, follow_up, fair, fair_edition, sales_rep",
    );

    const { rows: counts } = await client.query<{ table_name: string; n: string }>(`
      SELECT 'company' AS table_name, count(*) AS n FROM company
      UNION ALL SELECT 'contact', count(*) FROM contact
      UNION ALL SELECT 'opportunity', count(*) FROM opportunity
      UNION ALL SELECT 'activity', count(*) FROM activity
      UNION ALL SELECT 'follow_up', count(*) FROM follow_up
    `);
    console.log("[scale-check] row counts after cloning:");
    for (const row of counts) {
      console.log(`  ${row.table_name.padEnd(12)} ${row.n}`);
    }

    const sampleCompanyCode = "CO000001-G1";
    const sampleOpportunityCode = "OP007086-G1"; // has 11 activities in the source archive

    await explain(client, "Company page: opportunities grouped by fair", [sampleCompanyCode], `
      SELECT o.opportunity_code, o.description, o.status::text, o.amount_eur, o.opened_on,
             f.name AS fair_name, fe.edition_code, fe.starts_on
      FROM opportunity o
      JOIN fair_edition fe ON fe.id = o.fair_edition_id
      JOIN fair f ON f.id = fe.fair_id
      WHERE o.company_id = (SELECT id FROM company WHERE company_code = $1)
      ORDER BY f.name, fe.starts_on DESC
      LIMIT 200
    `);

    await explain(client, "Company page: account activity timeline (first page)", [sampleCompanyCode], `
      SELECT a.id, a.type::text, a.occurred_at, a.details, sr.display_name AS author_name,
             a.is_completed, o.opportunity_code
      FROM activity a
      JOIN sales_rep sr ON sr.id = a.author_rep_id
      LEFT JOIN opportunity o ON o.id = a.opportunity_id
      WHERE a.company_id = (SELECT id FROM company WHERE company_code = $1)
      ORDER BY a.occurred_at DESC, a.id DESC
      LIMIT 20
    `);

    await explain(client, "Opportunity page: this-edition-only conversation timeline (first page)", [sampleOpportunityCode], `
      SELECT a.id, a.type::text, a.occurred_at, a.details, sr.display_name AS author_name,
             a.is_completed, o.opportunity_code
      FROM activity a
      JOIN sales_rep sr ON sr.id = a.author_rep_id
      LEFT JOIN opportunity o ON o.id = a.opportunity_id
      WHERE a.opportunity_id = (SELECT id FROM opportunity WHERE opportunity_code = $1)
      ORDER BY a.occurred_at DESC, a.id DESC
      LIMIT 20
    `);

    await explain(client, "Follow-ups screen: bucketed overdue/today/next7/later, no rep filter", [], `
      WITH base AS (
        SELECT fu.id, fu.due_on, fu.title, sr.display_name AS assigned_rep_name,
               co.company_code, co.name AS company_name, o.opportunity_code,
               CASE
                 WHEN fu.due_on < ((now() AT TIME ZONE 'Europe/Rome')::date) THEN 'overdue'
                 WHEN fu.due_on = ((now() AT TIME ZONE 'Europe/Rome')::date) THEN 'today'
                 WHEN fu.due_on <= ((now() AT TIME ZONE 'Europe/Rome')::date) + 7 THEN 'next7'
                 ELSE 'later'
               END AS bucket
        FROM follow_up fu
        JOIN sales_rep sr ON sr.id = fu.assigned_rep_id
        JOIN company co ON co.id = fu.company_id
        LEFT JOIN opportunity o ON o.id = fu.opportunity_id
        WHERE fu.completed_at IS NULL
      )
      SELECT id, due_on, title, assigned_rep_name, company_code, company_name, opportunity_code, bucket
      FROM (
        SELECT *, row_number() OVER (PARTITION BY bucket ORDER BY due_on, id) AS rn
        FROM base
      ) ranked
      WHERE rn <= 50
      ORDER BY CASE bucket WHEN 'overdue' THEN 0 WHEN 'today' THEN 1 WHEN 'next7' THEN 2 ELSE 3 END, due_on, id
    `);

    await explain(client, "Search: exhibitor name (trigram word_similarity)", ["Aster"], `
      SELECT company_code, name, province_code, region
      FROM company
      WHERE lower(immutable_unaccent($1)) <% lower(immutable_unaccent(name))
      ORDER BY word_similarity(lower(immutable_unaccent($1)), lower(immutable_unaccent(name))) DESC, id
      LIMIT 25
    `);

    console.log(
      "\n[scale-check] done. The scale_check schema is left in place for inspection; " +
        "drop it with `DROP SCHEMA scale_check CASCADE;`, or it disappears with the rest of " +
        "this project's data on the next ./reset.sh.",
    );
  } finally {
    await client.end();
  }
}

async function explain(client: Client, label: string, params: unknown[], sql: string): Promise<void> {
  console.log(`\n=== ${label} ===`);
  const { rows } = await client.query<{ "QUERY PLAN": string }>(
    `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) ${sql}`,
    params,
  );
  console.log(rows.map((r) => r["QUERY PLAN"]).join("\n"));
}

main().catch((err) => {
  console.error("[scale-check] failed:", err);
  process.exitCode = 1;
});
