# Implementation plan — Exhibition sales CRM

Working document for the 48-hour assignment. Tracks the decisions, the build order, and the
things that must be true at review time.

---

## 0. What the reviewers actually check

Hard pass/fail gates, taken literally from `ASSIGNMENT.md`:

1. `data/`, `verify.sh`, `ASSIGNMENT.md`, `docs/*` get **replaced with originals**, then
   `./reset.sh` → `./dev.sh` → app reachable at `http://localhost:3000` with no extra commands,
   no env files to fill in.
2. Whole dataset imported (10 000 companies / 20 000 contacts / 15 000 opportunities /
   40 000 activities / 16 editions). No sampling, no generated substitutes, no edits to source files.
3. Second `./dev.sh` keeps user changes and **does not re-import**.
4. Everything pinned: images, runtime, package manager, committed lockfile, frozen install.
   No `latest`, no major-only tags. `linux/amd64` **and** `linux/arm64`.
5. Handoff assistant: 3 roles in one process, deterministic local stand-in (labelled as such),
   **no API keys / network model calls / model downloads**, every run persisted and re-runnable.
6. README: stack + versions, time spent, import decisions, how competing requests were reconciled,
   how to try the assistant with a complete and an incomplete enquiry, unfinished work.
7. Public repo, real commit history, email with exact subject/field format.

Everything below serves those seven.

---

## 1. Dataset findings (from profiling the supplied export)

Profiled all four files before designing the schema. Relevant facts:

| Check | Result |
|---|---|
| Referential integrity | **Clean.** 0 orphan company/contact/opportunity/edition references; 0 duplicate codes; 0 cross-company contact leaks |
| Quoting | Fields are quoted RFC-style; `;` appears **inside** quoted text (3 briefs). No embedded newlines, no escaped quotes. A real CSV parser is required — naive `split(';')` breaks |
| `legacy_status` | 13 raw spellings → 4 real states: `open`, `qualified`, `proposal`, `won`, `lost` (5). Case + surrounding whitespace vary, incl. one ` OPEN ` |
| Missing values | opportunities: `stand_area_sqm` 406, `requested_height_m` 349, `client_budget_eur` 365, `expected_close_on` 517, `historical_campaign_code` 3 015, `contact_code` 882. contacts: `fax` 15 999, `email` 1, `phone` 1 |
| Height vs edition limit | **1** opportunity exceeds it (`OP000005`, 6,00 m requested vs PACK-2026 limit 5,00 m). 1 210 sit exactly *at* the limit → `<=` must pass, not `<` |
| Activity semantics | `call`/`email`/`meeting` always `Y`; `task` always `N` (8 079 pending); `note` always empty marker. The marker is derivable but keep it explicit |
| Follow-ups | 5 718 rows carry `follow_up_on`, spread across all five types — **not** only tasks |
| Authors | 6 `legacy_author` usernames map 1:1 onto the 6 `sales_rep` display names (`a.morgan` → Alex Morgan, `c.martin` → Casey Martin, `j.chen` → Jamie Chen, `j.silva` → Jordan Silva, `s.rossi` → Sam Rossi, `t.singh` → Taylor Singh) — the six people in sales |
| Company-level activity | 5 001 rows have no `opportunity_code` — they belong to the account, not an edition |
| Editions | 4 fairs × 4 years (2024–2027), evenly ~3 750 opportunities per year. Past and future editions both present |
| Volume/company | ≤ 3 opportunities per company, ≤ 11 activities per opportunity |
| `budget < amount` | 4 884 rows — expected, they are different concepts. Never reconcile them |

**Demo fixtures fall out of this for free:**

- `OP000001` — complete (area 80, height 4,00 ≤ 4,50, budget 50 000, BEAUTY-2027)
- `OP000003` — incomplete ("Sales wants a technical handoff today. Plot size is still with the
  organiser; client has not decided the height." — area, height both empty)
- `OP000005` — conflicting (6,00 m fascia vs PACK-2026's 5,00 m limit, "No exception … is recorded")

The dataset was clearly seeded with exactly these three cases. Use them verbatim in the README.

---

## 2. Stack

| Layer | Choice | Pin |
|---|---|---|
| Runtime | Node.js 22 LTS, TypeScript | `node:22.<patch>-bookworm-slim` — resolve the exact current patch before committing |
| Package manager | pnpm via Corepack, `--frozen-lockfile` | version in `packageManager` field |
| HTTP + UI | Fastify + server-rendered templates (Eta), a single stylesheet, tiny sprinkles of vanilla JS | exact versions in lockfile |
| DB access | `pg` + hand-written SQL (Kysely optional for typing) | lockfile |
| Migrations | Numbered `.sql` files + ~40-line runner behind `pg_advisory_lock` | — |
| DB | `postgres:17.6-alpine3.22` | already pinned in starter |
| Tests | `node:test` + Testcontainers-free approach (test against the compose DB) | lockfile |

**Why server-rendered, not an SPA:** the deliverable is judged on domain modelling, import
correctness, query behaviour at 100 k, and the agent run audit trail. A React build adds toolchain
surface and Docker build time and buys nothing here. Forms + full page loads are fine for six
internal users. If time remains at the end, progressive enhancement on the search box only.

**Why no ORM:** the import is bulk SQL (`COPY` + set-based transforms), and the scale story is
about indexes and keyset pagination. Raw SQL keeps both legible to a reviewer.

Multi-arch: `node:*-bookworm-slim` and `postgres:*-alpine` are both amd64+arm64. No native deps
beyond `pg` (pure JS). Do not set `platform:` anywhere.

---

## 3. Data model

Legacy codes are kept as natural keys with `UNIQUE` constraints; internal surrogate `bigint`
identity PKs everywhere.

```
sales_rep(id, legacy_username UNIQUE, display_name)          -- 6 rows, from sales_rep + legacy_author
company(id, company_code UNIQUE, name, province_code, region, owner_rep_id → sales_rep)
contact(id, contact_code UNIQUE, company_id → company, legacy_row_id, first_name, last_name,
        email, phone, fax)
fair(id, name UNIQUE)                                        -- 4 rows, normalised out of editions
fair_edition(id, edition_code UNIQUE, fair_id → fair, city, venue, starts_on, ends_on,
             max_stand_height_m numeric(4,2))
opportunity(id, opportunity_code UNIQUE, company_id, contact_id NULL, fair_edition_id,
            description, amount_eur numeric(12,2), status opportunity_status,
            legacy_status_raw text, opened_on, expected_close_on NULL,
            historical_campaign_code NULL, stand_area_sqm numeric(8,2) NULL,
            client_budget_eur numeric(12,2) NULL, requested_height_m numeric(4,2) NULL,
            brief_notes, created_at, updated_at)
activity(id, legacy_entry_id UNIQUE NULL, company_id, opportunity_id NULL, type activity_type,
         occurred_at timestamptz, details, author_rep_id, is_completed bool NULL, created_at)
follow_up(id, company_id, opportunity_id NULL, due_on date, title, assigned_rep_id,
          source_activity_id NULL, completed_at NULL, created_at)
handoff_run(id, opportunity_id, created_at, policy_version, engine, input_snapshot jsonb,
            iterations, decision handoff_decision, reason)
handoff_run_step(id, run_id → handoff_run, iteration, role, output jsonb, created_at)
import_run(id, dataset_version, started_at, finished_at, source_checksums jsonb, row_counts jsonb)
import_issue(id, import_run_id, file, source_row_key, column, raw_value, issue, action)
```

Enums: `opportunity_status ∈ {open, qualified, proposal, won, lost}`;
`activity_type ∈ {call, email, meeting, note, task}`;
`handoff_decision ∈ {ready_for_technical, early_notice_only, blocked_conflict, blocked_missing_info}`.

### Modelling decisions to defend in the README

- **`follow_up` is a first-class table, not a nullable column on `activity`.** "If a customer
  promises to confirm the floor area on Friday, that needs to turn into something they can find and
  act on" — a follow-up has to be assignable, listable by due date, and *closable* without
  rewriting a historical log entry. Import creates one follow-up per activity row that has
  `follow_up_on` (5 718), plus every pending `task` (`N`) inherits an open follow-up. Activities
  stay immutable history; follow-ups are the mutable work queue.
- **`fair` normalised out of `fair_edition`.** The whole edition-scoping problem is "same fair,
  different year" — the UI needs `fair_id` to offer "other editions of this fair for this exhibitor"
  as an explicitly separate, read-only panel.
- **`legacy_status_raw` kept alongside the normalised enum.** Cheap, and it proves the
  normalisation without hiding the source.
- **`legacy_print_layout` dropped.** `data/README.md` calls it "obsolete presentation metadata from
  the previous system"; it carries no commercial information. Recorded as an explicit exclusion in
  the README. `legacy_row_id` *is* kept on `contact` for traceability back to the export.
- **`fax` kept** despite 80 % emptiness — it is commercial contact information.
- **`amount_eur` and `client_budget_eur` stay separate columns, never reconciled.** 4 884 rows
  disagree; `data/README.md` says they are different concepts.
- **Timestamps stored `timestamptz`,** parsed from `DD/MM/YYYY HH:mm` as `Europe/Rome`; dates stay
  `date`. All rendering in `Europe/Rome`.
- **Empty ≠ zero.** Every empty numeric imports as `NULL`. This is load-bearing for the handoff
  policy: an unknown height is not an approval.

---

## 4. Import

**Shape:** a one-shot `importer` compose service that runs migrations then the import, with the
`app` service gated on `depends_on: { importer: { condition: service_completed_successfully } }`.
The app therefore never serves a half-imported database, and `verify.sh` can't race the import.

**Pipeline** (`src/import/`):

1. Acquire `pg_advisory_lock` on a fixed key.
2. Read `manifest.json`; if an `import_run` row already exists for that `dataset_version` **and**
   matching `source_checksums`, log "already imported, skipping" and exit 0. ← this is the
   "later starts must not duplicate the import" gate.
3. Compute SHA-256 of each CSV and **verify against `manifest.json`**. Mismatch = loud warning in
   the log, not a failure (reviewers replace `data/`; the manifest ships with it, so they should
   agree — but never hard-fail the reviewer's startup on a checksum).
4. Stream each CSV through a real CSV parser (`;` delimiter, quote-aware) and `COPY … FROM STDIN`
   into `staging.*` tables whose columns are **all `text`**. Streaming, so memory is flat.
5. Set-based SQL transforms staging → normalised tables, in FK order:
   `sales_rep → fair → fair_edition → company → contact → opportunity → activity → follow_up`.
   - dates: `to_date(nullif(btrim(x),''), 'DD/MM/YYYY')`
   - timestamps: `to_timestamp(…, 'DD/MM/YYYY HH24:MI') AT TIME ZONE 'Europe/Rome'`
   - money/area/height: `replace(nullif(btrim(x),''), ',', '.')::numeric`
   - status: `lower(btrim(legacy_status))` → enum, with an explicit CASE (no fallthrough; anything
     unmapped goes to `import_issue` rather than being silently coerced)
   - `sales_rep`: derive the username↔display-name mapping from the data itself
     (first-initial + surname), assert 6↔6, fail loudly if the reviewer's copy disagrees
6. Write `import_run` + any `import_issue` rows. Log a summary table of counts per entity.
7. `ANALYZE` the touched tables.
8. Release the lock.

**Idempotency:** all inserts are `ON CONFLICT (…_code) DO NOTHING` on the natural keys, so even a
forced re-run cannot duplicate. The `import_run` check makes the normal path a no-op.

**Transformations live in the importer only.** `data/` is mounted `:ro` in compose. Nothing writes
to it.

**Target:** < 15 s cold import on the review hardware. `COPY` + set-based SQL over 75 k rows should
land closer to 3–5 s.

---

## 5. Reconciling the team's competing requests

This is the product-judgment part of the assignment. Three conflicts, three decisions:

### 5.1 "Everything about an exhibitor in one place" vs "this year's enquiry only"

Both, at different levels of the hierarchy — the conflict is a *navigation* problem, not a data one.

- **Company page = the account.** All contacts (entered once, reusable across every fair),
  every opportunity grouped by fair and year, company-level activities (the 5 001 rows with no
  opportunity), all open follow-ups. This is the account manager's "one place".
- **Opportunity page = one edition, and nothing else.** The timeline shows only activities whose
  `opportunity_id` matches. Company-level activities do **not** leak in. This is the sales
  coordinator's requirement, enforced by the query, not by a filter the user can forget.
- The bridge: a **collapsed, read-only "Other editions for this exhibitor"** strip on the
  opportunity page, listing prior/other editions with an unmissable line —
  *"Reference only. A previous edition's agreement does not apply to this one."* Prices, budgets
  and heights from other editions are shown as history, and nothing is ever pre-filled from them.
- Contacts are attached to the **company**, never re-entered per fair. An opportunity references a
  contact; 882 have none, which is a valid state, shown as "primary contact not set".

### 5.2 Sales director ("hand over at fair + budget") vs technical coordinator ("not before area + height are checked")

Reconciled by splitting the single "handoff" event into **two stages with different costs**:

| Stage | Trigger | What technical does |
|---|---|---|
| **Early notice** | fair edition + client budget known | Sees the enquiry in a visibility queue. Capacity awareness only. No design work starts. |
| **Technical handoff (accepted)** | area **and** height known, and `requested_height_m <= max_stand_height_m` for that edition, and the edition has not already ended | Work starts |

The sales director gets their speed — the enquiry is visible the moment a fair and a budget exist,
which is what "costs time" was actually about. The technical coordinator gets their protection —
nothing is *accepted* until the two numbers exist and have been checked against the edition, which
is what stops "starting work on requests it can't deliver".

Four outcomes, and the assistant always produces exactly one:

- `ready_for_technical` — all checks pass
- `early_notice_only` — fair + budget present, area and/or height missing → technical is notified,
  work does not start, and the assistant proposes a **pre-filled follow-up** asking the customer
  for the missing numbers
- `blocked_missing_info` — not even fair + budget → stays with sales, follow-up proposed
- `blocked_conflict` — requested height exceeds the edition limit and no exception is recorded
  (`OP000005`). Never auto-resolved, never rounded down. The proposed next step is to obtain a
  written exception or a revised height.

Boundary rule from the data: 1 210 opportunities request *exactly* the edition maximum, so the
comparison is `<=`, not `<`.

### 5.3 "Know who to call and what they're waiting for"

The `follow_up` table plus a **Follow-ups** screen: Overdue / Today / Next 7 days / Later, filterable
by sales rep, each row linking to its opportunity and contact, one click to complete or reschedule.
The handoff assistant writes into this same queue, so an incomplete enquiry produces an actionable
item rather than a dead end.

Relative to the archive reference time (`2026-09-01 09:00 Europe/Rome`) the imported data yields
~901 pending tasks due on or after that date, so the screen is populated on first run.

---

## 6. The handoff assistant

**Orchestration** — three plain functions in one process, no framework:

```
coordinator(opportunityId)
  ├─ gather()    → HandoffContext   (CRM facts + fair edition facts, snapshotted verbatim)
  ├─ preparer(ctx)                  → Brief   { facts, gaps[], proposedNextStep, stage }
  ├─ checker(ctx, brief)            → Review  { findings[{severity, code, message}], verdict }
  └─ decide()    → continue (≤1 revision) or stop, with a reason string
```

- **Preparer** assembles the brief: exhibitor, contact, edition + dates + venue + height limit,
  area, requested height, budget, status, brief notes, recent this-edition activity. Lists what is
  missing. Proposes a next step.
- **Checker** re-derives the policy independently from the snapshot and challenges the brief:
  missing-field blockers, the height-vs-limit conflict, past-edition check, budget-absent check,
  and a consistency check that the preparer's proposed stage matches the evidence.
- **Coordinator** runs preparer → checker; if the checker returns fixable findings it feeds them
  back for **one** revision pass (`iterations ≤ 2`, hard cap), then stops and records the decision
  and the reason. Never loops.

**Model stand-in:** `src/handoff/deterministic-stand-in.ts` — a pure, seedless, rule-and-template
renderer. Same input ⇒ byte-identical output. Labelled in the code, in the persisted run
(`engine: "deterministic-stand-in@1"`), and **in the UI** ("Generated by a deterministic local
stand-in — no language model is called"). No network, no keys, no downloads.

**Persistence & re-runs:** every run writes `handoff_run` (with the full `input_snapshot` jsonb —
so a past run is readable even after the opportunity changes) plus one `handoff_run_step` per role
per iteration. The opportunity page lists runs newest-first with decision badge, expandable to the
three role outputs and the inputs used. Edit the brief → "Run assistant again" → new run, old one
intact. That satisfies "we should be able to revisit it and run the assistant again after editing
the brief".

**README demo script:**
- complete → `OP000001` → `ready_for_technical`
- incomplete → `OP000003` → `blocked_missing_info` (area + height absent) + proposed follow-up
- bonus, conflicting → `OP000005` → `blocked_conflict` (6,00 m vs 5,00 m)
- then: edit `OP000003`, fill in area and height, re-run → `ready_for_technical`, both runs visible

---

## 7. Screens

| Route | Contents |
|---|---|
| `/` | Search + "today's work" (overdue/today follow-ups). Must return 200 — `verify.sh` hits it |
| `/search?q=` | Unified results: companies, contacts, opportunities. Trigram-backed, keyset-paginated |
| `/companies/:code` | Account view: details, contacts, opportunities grouped by fair/year, company-level activity, open follow-ups |
| `/opportunities/:code` | Edition view: editable brief fields, edition facts with a height-limit badge, **this-edition-only** timeline, log-a-conversation form, follow-ups, handoff panel + run history, collapsed "other editions" strip |
| `/follow-ups` | Overdue / Today / Next 7 days / Later, filter by rep, complete + reschedule |
| `/editions/:code` | Edition facts and its pipeline (cheap, and it makes the limit rule visible) |

Write paths needed: update opportunity brief fields, log an activity, create/complete/reschedule a
follow-up, run the assistant. Nothing else. No auth, no permissions, no billing — explicitly
excluded by the assignment.

---

## 8. Scale to 100 000 contacts

Target is 5× the shipped archive (≈ 50 k companies, 100 k contacts, 75 k opportunities,
200 k activities). Shipped volumes are small; the design has to be right anyway.

**Indexes**
- FKs all indexed: `contact(company_id)`, `opportunity(company_id)`, `opportunity(fair_edition_id)`,
  `activity(opportunity_id)`, `activity(company_id)`, `follow_up(opportunity_id)`
- Timeline: `activity(opportunity_id, occurred_at DESC, id DESC)` and the company equivalent —
  matches the page query exactly, supports keyset pagination
- Work queue: `follow_up(due_on, id) WHERE completed_at IS NULL` (partial — the open set stays
  small even as history grows)
- Pipeline: `opportunity(fair_edition_id, status)`
- Search: `pg_trgm` GIN on `company.name`, on `contact` full name, on `contact.email`; plus
  `unaccent` in the normalisation function. Trigram handles the CRM reality of partial and
  misspelled names, which `tsvector` prefix search does not
- Optional if time: a generated `tsvector` over `brief_notes` + `details` with GIN, for note search

**Query rules**
- Keyset pagination everywhere (`(sort_key, id) < (…)`), never `OFFSET n`
- No `SELECT *` into the templates; explicit column lists
- Company page loads contacts / opportunities / recent activity / follow-ups as bounded queries
  (`LIMIT 50` + "show more"), not one mega-join
- `numeric` for money, never float

**Evidence for the README**
A `scripts/scale-check.ts` that inflates a **throwaway** database to 100 k contacts by cloning
imported rows with new codes, then runs `EXPLAIN (ANALYZE, BUFFERS)` on the five real page queries
and prints the timings. This is a benchmark tool, run manually, writing to a separate database name —
it is **never** part of `dev.sh` and never touches the imported archive. Say so explicitly in the
README, because the assignment forbids generated replacement records in the import.

---

## 9. Compose & scripts

```yaml
services:
  db:        # unchanged from the starter, already pinned
  importer:  # build: . ; runs migrate + import ; restart: "no" ; depends_on db healthy
             # volumes: ./data:/app/data:ro
  app:       # build: . ; ports "3000:3000"
             # depends_on: importer (service_completed_successfully), db (service_healthy)
```

- All configuration inline in `compose.yml` — **no `.env` to fill in**, per the assignment.
- Same image for `importer` and `app`, different command → one build, cached.
- Multi-stage Dockerfile: deps (frozen install) → build (tsc) → runtime (slim, non-root,
  production deps only). No `platform:` keys anywhere.
- `.dockerignore` excluding `data/`, `node_modules`, `.git`.
- `dev.sh`: keep as-is (`up --build`) — it already satisfies the contract.
- `reset.sh`: keep `down --volumes --remove-orphans`, add `--rmi local` so the project's built
  images go too ("remove this project's persistent data and resources"). Still project-scoped —
  no `docker system prune`.
- `verify.sh`: untouched. Just make sure `GET /` returns 200.
- Healthcheck on `app` hitting an internal `/healthz`.

---

## 10. Tests

Small and targeted — enough to show the risky parts are covered, not a suite for its own sake.

1. **Transform units** (no DB): date `DD/MM/YYYY`, datetime + `Europe/Rome`, decimal-comma numerics,
   empty→`NULL`, the 13 status spellings → 5 enum values, username→rep mapping.
2. **Import integration**: run against the compose DB, assert exact row counts match
   `manifest.json`, assert zero orphans, assert `OP000005`'s height survives as 6,00 and the limit
   as 5,00 (the "keep both values" rule), then **run the import a second time** and assert counts
   are unchanged and only one `import_run` row exists.
3. **Handoff policy table test**: complete / missing-area / missing-height / missing-budget /
   height-over-limit / height-equal-to-limit / past-edition → expected decision. Plus a determinism
   test: same input twice ⇒ identical output JSON.
4. **Smoke**: `GET /`, a company page, an opportunity page, a search → 200.

---

## 11. Build order

| Phase | Work | Est. |
|---|---|---|
| 1 | Repo init, Dockerfile, compose wiring, migration runner, `/healthz` + placeholder `/` — get `./dev.sh` + `./verify.sh` **green before writing features** | 2 h |
| 2 | Schema migrations + indexes | 1.5 h |
| 3 | Importer: staging COPY, transforms, idempotency gate, issue log, counts summary | 4 h |
| 4 | Search + company page + opportunity page (read-only) | 3.5 h |
| 5 | Writes: edit brief, log activity, follow-ups screen + complete/reschedule | 3 h |
| 6 | Handoff assistant: policy, three roles, persistence, run history UI | 4 h |
| 7 | Tests (§10) | 2 h |
| 8 | Scale check + `EXPLAIN` evidence | 1.5 h |
| 9 | README, clean-clone rehearsal, submission email | 2 h |

≈ 23.5 h of work. Phases 1–6 are the minimum viable submission; 7–9 are what make it credible.
If time runs short, cut §8's benchmark script (keep the indexes and document the reasoning) and
`/editions/:code` — not the tests, and not the README.

---

## 12. Final rehearsal checklist

Run this from a **fresh clone on a clean Docker**, with `data/`, `verify.sh`, `docs/` and
`ASSIGNMENT.md` restored from pristine copies:

- [ ] `./reset.sh` then `./dev.sh` → app at `http://localhost:3000`, nothing else typed
- [ ] `./verify.sh` passes
- [ ] Row counts in the DB equal `manifest.json` exactly
- [ ] `docker compose down` then `./dev.sh` → edits survive, import logged as skipped, counts unchanged
- [ ] `./reset.sh` then `./dev.sh` → fresh import, counts correct again
- [ ] `git status` clean; `data/` untouched (`git diff` against pristine = empty)
- [ ] No `latest`, no major-only tags, no `platform:` anywhere; lockfile committed; frozen install
- [ ] No credentials beyond the starter's local-only Postgres password; no `.env` required
- [ ] No network calls at runtime (grep for `fetch`/`http` in `src/` outside the server itself)
- [ ] Assistant demo works for `OP000001`, `OP000003`, `OP000005`, and for re-run-after-edit
- [ ] README covers: stack + versions, time spent, import decisions **and exclusions**
      (`legacy_print_layout`), the three reconciliations in §5, assistant demo steps, unfinished work
- [ ] `git rev-parse HEAD` pushed **before** the email; email fields match the required format exactly
