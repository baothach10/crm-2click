-- One row per run of the handoff assistant. input_snapshot freezes the CRM + fair facts the
-- run actually used, so a past run stays readable even after the opportunity changes.
CREATE TABLE handoff_run (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  opportunity_id bigint NOT NULL REFERENCES opportunity (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  policy_version text NOT NULL,
  engine text NOT NULL,
  input_snapshot jsonb NOT NULL,
  iterations integer NOT NULL,
  decision handoff_decision NOT NULL,
  reason text NOT NULL
);

CREATE INDEX handoff_run_opportunity_id_idx ON handoff_run (opportunity_id, created_at DESC);

-- One row per role output per iteration (preparer/checker), so the run can be expanded
-- to show exactly what each role produced and why the coordinator stopped.
CREATE TABLE handoff_run_step (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id bigint NOT NULL REFERENCES handoff_run (id) ON DELETE CASCADE,
  iteration integer NOT NULL,
  role text NOT NULL,
  output jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX handoff_run_step_run_id_idx ON handoff_run_step (run_id, iteration, id);
