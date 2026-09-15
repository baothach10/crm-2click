-- One row per importer run. `dataset_version` + `source_checksums` (from manifest.json) let
-- the importer detect "already imported this exact archive" and skip on every later start.
CREATE TABLE import_run (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  dataset_version text NOT NULL,
  started_at timestamptz NOT NULL,
  finished_at timestamptz,
  source_checksums jsonb NOT NULL,
  row_counts jsonb
);

-- Anything the importer had to interpret or could not place cleanly: unmapped status
-- spellings, checksum mismatches, and the like. Kept for review, never fails the import.
CREATE TABLE import_issue (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  import_run_id bigint NOT NULL REFERENCES import_run (id) ON DELETE CASCADE,
  file text NOT NULL,
  source_row_key text NOT NULL,
  column_name text NOT NULL,
  raw_value text,
  issue text NOT NULL,
  action text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX import_issue_run_id_idx ON import_issue (import_run_id);
