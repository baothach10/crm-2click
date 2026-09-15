-- The six people in sales. legacy_username is activity_log.legacy_author (e.g. "a.morgan"),
-- display_name is companies_and_contacts.sales_rep (e.g. "Alex Morgan") — the importer proves
-- the 1:1 mapping and fails loudly if a review copy of the data disagrees.
CREATE TABLE sales_rep (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  legacy_username text NOT NULL UNIQUE,
  display_name text NOT NULL UNIQUE
);

-- Normalised out of fair_edition so the UI can offer "other editions of this fair"
-- without string-matching fair_name.
CREATE TABLE fair (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name text NOT NULL UNIQUE
);

CREATE TABLE fair_edition (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  edition_code text NOT NULL UNIQUE,
  fair_id bigint NOT NULL REFERENCES fair (id),
  city text NOT NULL,
  venue text NOT NULL,
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  max_stand_height_m numeric(4, 2) NOT NULL,
  CONSTRAINT fair_edition_dates_chk CHECK (ends_on >= starts_on)
);

CREATE INDEX fair_edition_fair_id_idx ON fair_edition (fair_id);
