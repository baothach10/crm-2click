-- Immutable history: a call/email/meeting/note/task attached to a company, and optionally
-- to one opportunity. Never edited after creation; `follow_up` is the mutable work queue.
CREATE TABLE activity (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  legacy_entry_id text UNIQUE,
  company_id bigint NOT NULL REFERENCES company (id),
  opportunity_id bigint REFERENCES opportunity (id),
  type activity_type NOT NULL,
  occurred_at timestamptz NOT NULL,
  details text NOT NULL,
  author_rep_id bigint NOT NULL REFERENCES sales_rep (id),
  -- true for a completed call/email/meeting, false for a pending task, null for a note
  -- (internal, neither pending nor completed).
  is_completed boolean,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX activity_company_id_idx ON activity (company_id);
CREATE INDEX activity_opportunity_id_idx ON activity (opportunity_id);
CREATE INDEX activity_author_rep_id_idx ON activity (author_rep_id);

-- Timeline pages read newest-first per opportunity/company and paginate by keyset,
-- so the index order matches the query order exactly.
CREATE INDEX activity_opportunity_timeline_idx
  ON activity (opportunity_id, occurred_at DESC, id DESC);
CREATE INDEX activity_company_timeline_idx
  ON activity (company_id, occurred_at DESC, id DESC);

-- The work queue: "who to call and what they're waiting for". One row per commitment,
-- so it can be found, assigned, and closed without rewriting the activity it came from.
CREATE TABLE follow_up (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id bigint NOT NULL REFERENCES company (id),
  opportunity_id bigint REFERENCES opportunity (id),
  due_on date NOT NULL,
  title text NOT NULL,
  assigned_rep_id bigint NOT NULL REFERENCES sales_rep (id),
  source_activity_id bigint REFERENCES activity (id),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX follow_up_company_id_idx ON follow_up (company_id);
CREATE INDEX follow_up_opportunity_id_idx ON follow_up (opportunity_id);
CREATE INDEX follow_up_assigned_rep_id_idx ON follow_up (assigned_rep_id);

-- The open queue stays small even as history grows, so a partial index keeps it cheap.
CREATE INDEX follow_up_open_due_idx ON follow_up (due_on, id) WHERE completed_at IS NULL;
