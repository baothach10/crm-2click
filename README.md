# Exhibition sales CRM

A small CRM for a fictional exhibition-stand company, built for the take-home assignment in
[ASSIGNMENT.md](ASSIGNMENT.md). Run `./dev.sh`, then open `http://localhost:3000`.

## Stack and versions

| | |
|---|---|
| Runtime | Node.js 22.23.2 (`node:22.23.2-bookworm-slim`), TypeScript 5.9.3 |
| Package manager | pnpm 12.4.1 via Corepack, frozen lockfile (`pnpm-lock.yaml` committed) |
| Web | Fastify 5.12.4, server-rendered HTML via a small dependency-free auto-escaping `html\`\`` tag ([app/src/web/html.ts](app/src/web/html.ts)) — no template engine, no client-side framework |
| Database | PostgreSQL 17.6 (`postgres:17.6-alpine3.22`, from the starter), accessed via `pg` 8.23.0 with hand-written SQL (no ORM) |
| Import | `pg-copy-streams` 7.0.0, streaming the CSVs into Postgres's own `COPY ... CSV` parser |
| Tests | Node's built-in test runner, run via `node --experimental-strip-types` (no test framework dependency) |

Everything builds from source via a multi-stage `Dockerfile`; both `node` and `postgres` images
support `linux/amd64` and `linux/arm64` (checked with `docker manifest inspect`), and nothing in
`compose.yml` or the Dockerfile pins an architecture.

## Architecture choices

**No ORM.** All data access is hand-written, parameterized SQL via `pg`
([app/src/db/queries](app/src/db/queries), [app/src/db/writes](app/src/db/writes)). The import is
bulk `COPY` + set-based SQL transforms, and the scale story is entirely about indexes and query
shape — an ORM would sit between me and both of those without buying anything back for an app
this size. It also keeps every query legible to a reviewer as plain SQL, not a generated one.

**No frontend JavaScript framework, for now.** Every screen is server-rendered HTML, built with a
~40-line dependency-free auto-escaping `html\`\`` tag ([app/src/web/html.ts](app/src/web/html.ts))
rather than a template engine, and returned directly from the Fastify route that queried it — no
API layer, no client-side state, no build step for the frontend. For a six-person internal tool
with no complex client-side interaction, a React/Vue SPA would mean a second codebase and a
JSON contract to maintain for no real benefit; it's a reasonable place to add one later if the
UI grows real client-side interactivity, not a limitation of the approach taken now.

**Security, concretely:**
- **XSS**: the `html\`\`` tag auto-escapes every interpolated value by default; raw markup can
  only be inserted via an explicit `raw()` call, and every use of `raw()` in the codebase wraps a
  static string literal, never request or database data (checked by grep, not just by design).
- **SQL injection**: every query is parameterized (`$1`, `$2`, ...) — no string-built SQL from
  request input anywhere in the app.
- **Open redirect**: the follow-ups screen's "return to where I came from" field is
  attacker-controllable request data even though this app's own forms only ever fill it with a
  same-origin path; `safeRedirectPath()` ([app/src/routes/followUps.ts](app/src/routes/followUps.ts))
  rejects anything that isn't a genuine relative path before it reaches `reply.redirect()`.
- **Tampered foreign keys**: editing an opportunity's primary contact validates server-side that
  the submitted `contact_id` actually belongs to that opportunity's own company
  ([app/src/db/writes/opportunity.ts](app/src/db/writes/opportunity.ts)) — the option list is only
  ever rendered from the right company, but the check doesn't trust that a request will match it.
- **No secrets beyond the starter's own local-development-only Postgres password**; no `.env`
  file, nothing committed that shouldn't be.
- **Container hardening**: the runtime image runs as a non-root user (`appuser`, uid 10001), and
  the handoff assistant makes no outbound network calls, needs no API key, and downloads nothing.

## Time spent

Roughly 6 hours of active work, from the commit history (excludes the overnight gap between
sessions). *(I'm estimating this from git timestamps rather than a stopwatch — worth double-checking
against your own sense of it before sending.)*

## Running it

```
./dev.sh      # build, start, migrate, import, serve at http://localhost:3000
./verify.sh   # check Compose config + HTTP reachability
./reset.sh    # stop and remove this project's data/images; next ./dev.sh reimports
```

No `.env` file, no manual configuration. The Postgres password in `compose.yml` is the starter's
own local-development-only value.

Tests (opt-in, never run by `./dev.sh`):

```
docker compose --profile test run --rm test
```

23 tests: pure unit tests for the handoff policy, integration tests against the live imported
database (exact row counts, DST-correct timestamps, re-import idempotency), and HTTP smoke tests.

The 100k-scale benchmark (also opt-in, also never touches the real archive):

```
docker compose --profile test run --rm test node --experimental-strip-types scripts/scale-check.ts
```

Clones the imported archive 5x into a throwaway `scale_check` schema and runs
`EXPLAIN (ANALYZE, BUFFERS)` on the five real page queries. Saved output at
[app/scripts/scale-check-output.txt](app/scripts/scale-check-output.txt); summary below.

## Import decisions

The whole archive imports every time from a clean database: 10,000 companies, 20,000 contacts,
15,000 opportunities, 40,000 activities, 16 fair editions — exact counts, checked by
[test/import-integration.test.ts](app/test/import-integration.test.ts). CSVs stream via
Postgres's native `COPY ... FORMAT csv` straight into `UNLOGGED` staging tables (all-text
columns), then a set of SQL files in [src/import/transform/](app/src/import/transform) transform
staging into the domain schema in FK order. An `import_run` row records the dataset version and
each file's SHA-256; a later `./dev.sh` compares checksums and skips re-importing if nothing
changed, so restarts never duplicate data, and a real content change always re-triggers a full
import. A checksum mismatch against `manifest.json` is logged as an `import_issue`, not a failure.

Interpretation decisions worth flagging:

- **`legacy_status` is normalised** via `lower(btrim(...))` into a 5-value enum
  (`open`/`qualified`/`proposal`/`won`/`lost`); the 13 raw spellings in the archive (casing and
  whitespace) all resolve cleanly, and 0 rows fell through to the "unrecognised" path.
- **The six sales reps are derived**, not hand-entered: `sales_rep.legacy_username` (matching
  `activity_log.legacy_author`, e.g. `a.morgan`) is generated from `sales_rep.display_name`
  (e.g. `Alex Morgan`) via first-initial + surname. The importer asserts this covers every author
  in the activity log and refuses to import otherwise — see
  [verifySalesRepCoverage](app/src/import/run.ts).
- **`requested_height_m` is never checked against the fair edition's limit during import.** The
  archive intentionally contains, and the handoff policy needs to see, requests that exceed it
  (`OP000005`: 6.00m requested vs. PACK-2026's 5.00m limit) — both values are kept, unreconciled.
- **`amount_eur` and `client_budget_eur` are kept as separate columns, never reconciled** — 4,884
  rows disagree between them in the archive; `data/README.md` says they're different concepts
  (recorded opportunity value vs. the customer's stated budget), and conflating them would be a
  real judgement call the CRM has no business making silently.
- **`legacy_print_layout` is dropped.** `data/README.md` calls it "obsolete presentation metadata
  from the previous system"; it carries no commercial information. `legacy_row_id` is kept on
  `contact` for traceability back to the export.
- **Empty means `NULL`, never zero** — an unset budget, area, or height is unknown, not zero and
  not an implicit approval. This is load-bearing for the handoff policy: missing information has
  to actually block a decision, not silently default to "fine."
- **Timestamps** parse `DD/MM/YYYY HH:mm` as `Europe/Rome`, verified correct on both sides of the
  CEST/CET boundary (a summer entry and a winter entry both round-trip correctly through UTC
  storage — see the import integration test).
- **Follow-ups have two sources**, both guarded against duplication on a re-import: any activity
  (any type, completed or not) that carries a `follow_up_on` date (5,718 rows — e.g. a completed
  call where the customer promised to confirm the floor area on Friday), plus any pending `task`
  that doesn't have one but still needs to be findable (6,887 rows, due the day it was logged).
  12,605 total, matching the archive.

## How the team's competing requests were reconciled

**"Everything in one place" vs. "only this year's conversations."** Both, at different levels.
The **company page** is the whole account: every contact (entered once, never re-entered per
fair), every opportunity grouped by fair, account-level activity, open follow-ups. The
**opportunity page** shows only that edition's own conversations — enforced by the query
(`WHERE opportunity_id = ...`), not a filter a user could forget to apply. Other editions of the
same fair for the same exhibitor appear only in a collapsed, explicitly-labelled reference strip
("A previous edition's agreement does not apply to this one") — nothing from a prior edition is
ever pre-filled into a new one.

**Sales director ("hand off at fair + budget") vs. technical coordinator ("check against the fair
first").** Split into two stages: **early notice** (budget known — every opportunity already has
a fair edition by construction) gives technical visibility for capacity planning, no design work
starts; **accepted handoff** additionally requires stand area *and* height to be known *and*
checked against the edition's limit (`<=`, not `<` — 1,210 opportunities in the archive sit
exactly at the limit). Sales gets the speed they wanted; technical gets the check they wanted.
Four possible outcomes, encoded directly into the handoff assistant's policy (see below).

**"Who to call and what they're waiting for."** A first-class `follow_up` table (not a column on
`activity`), with a dedicated `/follow-ups` screen: overdue / today / next 7 days / later,
filterable by rep, with complete and reschedule actions. The handoff assistant writes into this
same queue when it needs something from the customer, so an incomplete enquiry produces an
actionable item rather than a dead end.

## Trying the handoff assistant

Open an opportunity page and use the "Handoff assistant" section (no seed data or special setup
needed — these are opportunities already in the imported archive):

| Opportunity | What's on file | Decision |
|---|---|---|
| [`OP000001`](http://localhost:3000/opportunities/OP000001) | Budget, area, and height all known; height within the fair's limit | **Ready for technical**, on the first pass |
| [`OP000003`](http://localhost:3000/opportunities/OP000003) | Budget known; area and height not yet | **Early notice only** — technical gets visibility, work doesn't start, and a follow-up asking for the missing numbers is proposed |
| [`OP000005`](http://localhost:3000/opportunities/OP000005) | Everything present, but the requested height (6.00m) exceeds the edition's limit (5.00m) | **Blocked — conflict**, reached via one revision (see below) |

The assistant runs three plain functions, no agent framework: a **preparer** does a fast pass over
which fields are present (deliberately *not* checking height against the limit — see
[policy.ts](app/src/handoff/policy.ts) for why), a **checker** independently re-derives the
decision from the same frozen snapshot, additionally checking the height-vs-limit and
edition-still-open conditions, and a **coordinator** runs preparer → checker and, on a mismatch,
feeds the checker's finding back for exactly one revision (capped at 2 iterations — structural,
not a retry budget). On `OP000005` the preparer's shallow pass proposes "ready for technical"
since every field is present; the checker's height check catches the conflict and forces the
correction. Every run is persisted with what it used, both roles' output, and the reason for the
decision — click "Details" on any past run, or edit the brief and click "Run assistant again" to
see a new run appear alongside the old one (try filling in `OP000003`'s area and height, then
re-running it).

The "model" is a deterministic, seedless, rule-and-template renderer
([deterministicStandIn.ts](app/src/handoff/deterministicStandIn.ts)), labelled as such in the code,
in the persisted run (`engine: "deterministic-stand-in@1"`), and in the UI. Same input produces
byte-identical output — no API keys, no network calls, no model downloads.

## Scale

See [PLAN.md](PLAN.md#8-scale-to-100-000-contacts) for the full index rationale. Measured at 5x
the shipped archive (50k companies / 100k contacts / 75k opportunities / 200k activities / 63k
follow-ups): the company-page opportunities query, both activity timelines, and trigram exhibitor
search all resolve via their indexes in under 5ms. The one exception is the follow-ups screen's
bucketed query (~138ms via a sequential scan) — expected, not a missed index: it computes an
overdue/today/next7/later bucket for every open row before windowing each bucket to 50, so a
`(due_on, id) WHERE completed_at IS NULL` index can't shortcut it the way it does for a single
ordered slice. Still comfortably fast for a 6-person team.

## Unfinished / cut

- **`/editions/:code`** (a page showing one fair edition's own pipeline) was planned but cut for
  time — the height-limit information it would show is already visible on each opportunity page.
- **Search pagination**: exhibitor/contact search returns the top 25 matches by relevance with no
  "next page." The high-volume lists that actually need it at scale (activity timelines,
  follow-ups) have real keyset pagination; a typed search query narrows results enough in
  practice that deep pagination didn't seem worth the added complexity of paginating by a
  similarity score. Noted as a deliberate scope cut, not an oversight.
- No creation of brand-new companies, contacts, or opportunities from the UI — the assignment's
  write requirements are updating an existing opportunity, logging a conversation, and
  follow-ups, all against the imported archive; nothing asked for entering new exhibitors from
  scratch.
- Single implicit user throughout, per the assignment ("assume one user with access to the
  archive") — no login, permissions, or audit-by-user beyond the "logged by" / "assigned to"
  fields already on activities and follow-ups.
