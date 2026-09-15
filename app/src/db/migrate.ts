import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "./pool.js";

const MIGRATIONS_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "migrations",
);

// Arbitrary fixed key: any 64-bit constant works, it just has to be unique to this app.
const ADVISORY_LOCK_KEY = 8412_5522_71n;

async function loadMigrationFiles(): Promise<string[]> {
  const entries = await readdir(MIGRATIONS_DIR);
  return entries.filter((f) => f.endsWith(".sql")).sort();
}

export async function migrate(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [ADVISORY_LOCK_KEY]);
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version text PRIMARY KEY,
          applied_at timestamptz NOT NULL DEFAULT now()
        )
      `);

      const files = await loadMigrationFiles();
      const { rows } = await client.query<{ version: string }>(
        "SELECT version FROM schema_migrations",
      );
      const applied = new Set(rows.map((r) => r.version));

      for (const file of files) {
        if (applied.has(file)) {
          continue;
        }
        const sql = await readFile(path.join(MIGRATIONS_DIR, file), "utf8");
        console.log(`[migrate] applying ${file}`);
        await client.query("BEGIN");
        try {
          await client.query(sql);
          await client.query(
            "INSERT INTO schema_migrations (version) VALUES ($1)",
            [file],
          );
          await client.query("COMMIT");
        } catch (err) {
          await client.query("ROLLBACK");
          throw err;
        }
      }
      console.log(`[migrate] up to date (${files.length} migration(s))`);
    } finally {
      await client.query("SELECT pg_advisory_unlock($1)", [ADVISORY_LOCK_KEY]);
    }
  } finally {
    client.release();
  }
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  migrate()
    .then(() => pool.end())
    .catch((err) => {
      console.error("[migrate] failed:", err);
      process.exitCode = 1;
      return pool.end();
    });
}
