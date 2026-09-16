import { Pool, types } from "pg";

// pg's default `date` (OID 1082) parser returns a JS Date at UTC midnight, which invites
// timezone bugs (comparing it with a plain "YYYY-MM-DD" string silently coerces to NaN and
// is always false). A calendar date has no time-of-day or zone to begin with, so keep it as
// the plain "YYYY-MM-DD" text Postgres already sends (its default ISO DateStyle guarantees
// that format) and let src/web/format.ts do any display formatting.
types.setTypeParser(1082, (value) => value);

function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  return url;
}

export const pool = new Pool({ connectionString: databaseUrl() });

// pg emits 'error' on the pool when an *idle* client's connection dies underneath it (e.g.
// the database restarts or a network blip drops the TCP connection) -- Node treats an
// unhandled 'error' event as fatal and crashes the process. The pool has already discarded
// that client; the next query just opens a fresh connection, so logging and moving on is
// the correct response, not letting one dead idle connection take the whole app down.
pool.on("error", (err) => {
  console.error("[db] idle client error (pool continues, a new connection will be opened):", err);
});
