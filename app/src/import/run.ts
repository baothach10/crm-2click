import { createReadStream } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";
import type { PoolClient } from "pg";
import { from as copyFrom } from "pg-copy-streams";
import { pool } from "../db/pool.js";

const DATA_DIR = process.env.DATA_DIR ?? "/app/data";

// Arbitrary fixed key distinct from migrate.ts's lock, so the two can never collide.
const IMPORT_LOCK_KEY = 8412_5522_72n;

const SELF_DIR = path.dirname(fileURLToPath(import.meta.url));
const TRANSFORM_DIR = path.join(SELF_DIR, "transform");

interface CsvSource {
  file: string;
  table: string;
  columns: string[];
}

// Column lists mirror each CSV's header row exactly. COPY maps by position, not by name,
// so this order is load-bearing even though the header row itself is only skipped.
const SOURCES: CsvSource[] = [
  {
    file: "companies_and_contacts.csv",
    table: "staging.companies_and_contacts",
    columns: [
      "legacy_row_id", "company_code", "company_name", "province_code", "region", "sales_rep",
      "contact_code", "contact_first_name", "contact_last_name", "email", "phone", "fax",
      "legacy_print_layout",
    ],
  },
  {
    file: "opportunities.csv",
    table: "staging.opportunities",
    columns: [
      "opportunity_code", "company_code", "contact_code", "description", "amount_eur",
      "legacy_status", "opened_on", "expected_close_on", "historical_campaign_code",
      "fair_edition_code", "stand_area_sqm", "client_budget_eur", "requested_height_m",
      "brief_notes",
    ],
  },
  {
    file: "fair_editions.csv",
    table: "staging.fair_editions",
    columns: ["fair_edition_code", "fair_name", "city", "venue", "starts_on", "ends_on", "max_stand_height_m"],
  },
  {
    file: "activity_log.csv",
    table: "staging.activity_log",
    columns: [
      "entry_id", "company_code", "opportunity_code", "activity_type", "occurred_at", "details",
      "follow_up_on", "completion_marker", "legacy_author",
    ],
  },
];

interface Manifest {
  dataset_version: string;
  files: Record<string, { data_rows: number; sha256: string }>;
}

function sha256File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

async function copyCsv(client: PoolClient, source: CsvSource): Promise<void> {
  const sql =
    `COPY ${source.table} (${source.columns.join(", ")}) FROM STDIN ` +
    `WITH (FORMAT csv, DELIMITER ';', QUOTE '"', HEADER true, ENCODING 'UTF8')`;
  const ingest = client.query(copyFrom(sql));
  const fileStream = createReadStream(path.join(DATA_DIR, source.file));
  await pipeline(fileStream, ingest);
}

async function runSqlFile(client: PoolClient, filePath: string): Promise<void> {
  const sql = await readFile(filePath, "utf8");
  await client.query(sql);
}

async function countRows(client: PoolClient, table: string): Promise<number> {
  const { rows } = await client.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table}`);
  return rows[0].n;
}

// The six sales_rep rows are derived from companies_and_contacts.sales_rep display names
// (e.g. "Alex Morgan" -> "a.morgan"). This asserts that derivation actually covers every
// author who appears in the activity log; if it doesn't, the mapping assumption has broken
// and every activity/follow_up FK below would silently fail instead, so fail loudly here.
async function verifySalesRepCoverage(client: PoolClient): Promise<void> {
  const { rows: repRows } = await client.query<{ legacy_username: string }>(
    "SELECT legacy_username FROM sales_rep",
  );
  const { rows: authorRows } = await client.query<{ legacy_author: string }>(
    "SELECT DISTINCT btrim(legacy_author) AS legacy_author FROM staging.activity_log",
  );
  const reps = new Set(repRows.map((r) => r.legacy_username));
  const missing = authorRows.map((r) => r.legacy_author).filter((a) => !reps.has(a));
  if (missing.length > 0) {
    throw new Error(
      `sales_rep derivation (first-initial + surname) does not cover every activity author: ` +
        `missing username(s) [${missing.join(", ")}]. Refusing to import with a broken rep mapping.`,
    );
  }
}

export async function runImport(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [IMPORT_LOCK_KEY]);
    try {
      const manifest: Manifest = JSON.parse(
        await readFile(path.join(DATA_DIR, "manifest.json"), "utf8"),
      );

      const checksums: Record<string, string> = {};
      for (const source of SOURCES) {
        checksums[source.file] = await sha256File(path.join(DATA_DIR, source.file));
      }

      const { rows: existing } = await client.query<{ id: number }>(
        `SELECT id FROM import_run
         WHERE dataset_version = $1 AND source_checksums = $2::jsonb
         ORDER BY id DESC LIMIT 1`,
        [manifest.dataset_version, JSON.stringify(checksums)],
      );
      if (existing.length > 0) {
        console.log(
          `[import] dataset_version ${manifest.dataset_version} already imported as run #${existing[0].id} ` +
            "with matching file checksums; skipping",
        );
        return;
      }

      await client.query("BEGIN");
      try {
        // clock_timestamp(), not now(): now() is fixed for the whole transaction, so
        // started_at and finished_at would otherwise record the exact same instant.
        const { rows: runRows } = await client.query<{ id: number }>(
          `INSERT INTO import_run (dataset_version, started_at, source_checksums)
           VALUES ($1, clock_timestamp(), $2::jsonb) RETURNING id`,
          [manifest.dataset_version, JSON.stringify(checksums)],
        );
        const importRunId = runRows[0].id;

        for (const [file, expected] of Object.entries(manifest.files ?? {})) {
          const actual = checksums[file];
          if (actual && expected?.sha256 && actual !== expected.sha256) {
            console.warn(
              `[import] checksum mismatch for ${file}: manifest.json says ${expected.sha256}, file is ${actual}`,
            );
            await client.query(
              `INSERT INTO import_issue (import_run_id, file, source_row_key, column_name, raw_value, issue, action)
               VALUES ($1, $2, '-', 'sha256', $3, 'checksum does not match manifest.json', 'import continued using the file as provided')`,
              [importRunId, file, actual],
            );
          }
        }

        await runSqlFile(client, path.join(SELF_DIR, "staging.sql"));

        console.log("[import] loading CSVs into staging...");
        for (const source of SOURCES) {
          await copyCsv(client, source);
        }

        console.log("[import] transforming staging into the domain schema...");
        const transformFiles = (await readdir(TRANSFORM_DIR))
          .filter((f) => f.endsWith(".sql"))
          .sort();
        for (const file of transformFiles) {
          await runSqlFile(client, path.join(TRANSFORM_DIR, file));
          // sales_rep must be fully populated before verifying coverage, and before any
          // later transform (company, activity, ...) that joins to it by legacy_username.
          if (file === "01_sales_rep.sql") {
            await verifySalesRepCoverage(client);
          }
        }

        const { rows: skippedStatusRows } = await client.query<{
          opportunity_code: string;
          legacy_status: string;
        }>(`
          SELECT opportunity_code, legacy_status
          FROM staging.opportunities
          WHERE CASE lower(btrim(legacy_status))
                  WHEN 'open' THEN 'open' WHEN 'qualified' THEN 'qualified' WHEN 'proposal' THEN 'proposal'
                  WHEN 'won' THEN 'won' WHEN 'lost' THEN 'lost' ELSE NULL
                END IS NULL
        `);
        for (const row of skippedStatusRows) {
          await client.query(
            `INSERT INTO import_issue (import_run_id, file, source_row_key, column_name, raw_value, issue, action)
             VALUES ($1, 'opportunities.csv', $2, 'legacy_status', $3, 'unrecognised status after normalisation', 'row skipped')`,
            [importRunId, row.opportunity_code, row.legacy_status],
          );
        }

        const rowCounts = {
          sales_rep: await countRows(client, "sales_rep"),
          fair: await countRows(client, "fair"),
          fair_edition: await countRows(client, "fair_edition"),
          company: await countRows(client, "company"),
          contact: await countRows(client, "contact"),
          opportunity: await countRows(client, "opportunity"),
          activity: await countRows(client, "activity"),
          follow_up: await countRows(client, "follow_up"),
        };

        await client.query(
          "UPDATE import_run SET finished_at = clock_timestamp(), row_counts = $2::jsonb WHERE id = $1",
          [importRunId, JSON.stringify(rowCounts)],
        );

        await client.query("COMMIT");

        await client.query(
          "ANALYZE sales_rep, fair, fair_edition, company, contact, opportunity, activity, follow_up",
        );

        console.log(`[import] run #${importRunId} complete:`);
        for (const [table, count] of Object.entries(rowCounts)) {
          console.log(`  ${table.padEnd(14)} ${count}`);
        }
        if (skippedStatusRows.length > 0) {
          console.warn(`[import] ${skippedStatusRows.length} opportunity row(s) skipped: unrecognised status`);
        }
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    } finally {
      await client.query("SELECT pg_advisory_unlock($1)", [IMPORT_LOCK_KEY]);
    }
  } finally {
    client.release();
  }
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  runImport()
    .then(() => pool.end())
    .catch((err) => {
      console.error("[import] failed:", err);
      process.exitCode = 1;
      return pool.end();
    });
}
