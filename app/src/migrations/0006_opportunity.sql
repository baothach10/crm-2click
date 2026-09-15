-- One row per stand enquiry for one company at one fair edition. `requested_height_m` is
-- deliberately not checked against fair_edition.max_stand_height_m here: the archive contains
-- (and the handoff policy must see) requests that exceed the limit. Keep both values, judge later.
CREATE TABLE opportunity (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  opportunity_code text NOT NULL UNIQUE,
  company_id bigint NOT NULL REFERENCES company (id),
  contact_id bigint REFERENCES contact (id),
  fair_edition_id bigint NOT NULL REFERENCES fair_edition (id),
  description text NOT NULL,
  amount_eur numeric(12, 2) NOT NULL,
  status opportunity_status NOT NULL,
  legacy_status_raw text NOT NULL,
  opened_on date NOT NULL,
  expected_close_on date,
  historical_campaign_code text,
  stand_area_sqm numeric(8, 2),
  client_budget_eur numeric(12, 2),
  requested_height_m numeric(4, 2),
  brief_notes text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX opportunity_company_id_idx ON opportunity (company_id);
CREATE INDEX opportunity_contact_id_idx ON opportunity (contact_id);
CREATE INDEX opportunity_fair_edition_id_idx ON opportunity (fair_edition_id);

-- Pipeline-by-edition view: "how many open opportunities does BEAUTY-2027 have".
CREATE INDEX opportunity_edition_status_idx ON opportunity (fair_edition_id, status);

CREATE TRIGGER opportunity_set_updated_at
  BEFORE UPDATE ON opportunity
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
