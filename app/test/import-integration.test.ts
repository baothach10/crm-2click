// Integration test: requires a live `db` with the archive already imported (i.e. the
// compose stack has already run the `importer` service once). Talks to Postgres directly
// via `pg` -- a real installed package, not a relative source import -- and re-invokes the
// already-built importer as a child process for the idempotency check, so this file never
// needs to resolve any of this project's own .ts source at runtime.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { after, before, test } from "node:test";
import pg from "pg";

const { Client } = pg;

let client: InstanceType<typeof Client>;

before(async () => {
  client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
});

after(async () => {
  await client.end();
});

async function countRows(table: string): Promise<number> {
  const { rows } = await client.query<{ n: string }>(`SELECT count(*) AS n FROM ${table}`);
  return Number(rows[0].n);
}

// Row counts must match manifest.json exactly: opportunities.csv;companies_and_contacts.csv;
// activity_log.csv all have zero rows dropped by a failed JOIN in the transform step (a
// silently-dropped row -- e.g. a company_code that didn't match -- would show up here as a
// count below the source total, which is the practical form the plan's "zero orphans" check
// takes given the schema's own FK constraints already make a *stored* orphan impossible).
// follow_up's 12605 is a derived total: 5718 activities (any type) carry a follow_up_on date,
// plus 6887 pending tasks that don't but still need to be findable.
test("row counts match the source archive exactly", async () => {
  assert.equal(await countRows("company"), 10000);
  assert.equal(await countRows("contact"), 20000);
  assert.equal(await countRows("opportunity"), 15000);
  assert.equal(await countRows("activity"), 40000);
  assert.equal(await countRows("follow_up"), 12605);
  assert.equal(await countRows("fair_edition"), 16);
});

test("no opportunity rows were skipped for an unrecognised status", async () => {
  const { rows } = await client.query<{ n: string }>(
    "SELECT count(*) AS n FROM import_issue WHERE column_name = 'legacy_status'",
  );
  assert.equal(Number(rows[0].n), 0);
});

test("sales_rep derivation covers exactly the six people in the archive", async () => {
  const { rows } = await client.query<{ legacy_username: string; display_name: string }>(
    "SELECT legacy_username, display_name FROM sales_rep ORDER BY legacy_username",
  );
  assert.deepEqual(
    rows.map((r) => r.legacy_username),
    ["a.morgan", "c.martin", "j.chen", "j.silva", "s.rossi", "t.singh"],
  );
  const alex = rows.find((r) => r.legacy_username === "a.morgan");
  assert.equal(alex?.display_name, "Alex Morgan");
});

test("OP000005 keeps both the requested height and the edition's limit, unreconciled", async () => {
  const { rows } = await client.query<{ requested_height_m: string; max_stand_height_m: string }>(
    `SELECT o.requested_height_m, fe.max_stand_height_m
     FROM opportunity o JOIN fair_edition fe ON fe.id = o.fair_edition_id
     WHERE o.opportunity_code = 'OP000005'`,
  );
  assert.equal(rows[0]?.requested_height_m, "6.00");
  assert.equal(rows[0]?.max_stand_height_m, "5.00");
});

test("timestamps parse DD/MM/YYYY HH:mm as Europe/Rome across the CEST/CET boundary", async () => {
  const { rows } = await client.query<{ legacy_entry_id: string; occurred_at: Date }>(
    "SELECT legacy_entry_id, occurred_at FROM activity WHERE legacy_entry_id IN ($1, $2)",
    ["AC0000001", "AC0000085"],
  );
  const summer = rows.find((r) => r.legacy_entry_id === "AC0000001"); // 25/08/2026 10:30, CEST = UTC+2
  const winter = rows.find((r) => r.legacy_entry_id === "AC0000085"); // 19/01/2026 23:38, CET = UTC+1
  assert.equal(summer?.occurred_at.toISOString(), "2026-08-25T08:30:00.000Z");
  assert.equal(winter?.occurred_at.toISOString(), "2026-01-19T22:38:00.000Z");
});

test("re-running the importer does not duplicate data (idempotent on unchanged checksums)", async () => {
  const before_ = {
    company: await countRows("company"),
    opportunity: await countRows("opportunity"),
    follow_up: await countRows("follow_up"),
    importRuns: await countRows("import_run"),
  };

  const stdout = execFileSync("node", ["dist/import/run.js"], { encoding: "utf8" });
  assert.match(stdout, /already imported.*skipping/);

  assert.equal(await countRows("company"), before_.company);
  assert.equal(await countRows("opportunity"), before_.opportunity);
  assert.equal(await countRows("follow_up"), before_.follow_up);
  assert.equal(await countRows("import_run"), before_.importRuns);
});
