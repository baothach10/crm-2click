-- Transient landing tables for the raw CSV export. All columns are text: no interpretation
-- happens until the transform step. UNLOGGED because they are reloaded from scratch on every
-- import run and never need to survive a crash.
CREATE SCHEMA IF NOT EXISTS staging;

CREATE UNLOGGED TABLE IF NOT EXISTS staging.companies_and_contacts (
  legacy_row_id text,
  company_code text,
  company_name text,
  province_code text,
  region text,
  sales_rep text,
  contact_code text,
  contact_first_name text,
  contact_last_name text,
  email text,
  phone text,
  fax text,
  legacy_print_layout text
);
TRUNCATE staging.companies_and_contacts;

CREATE UNLOGGED TABLE IF NOT EXISTS staging.opportunities (
  opportunity_code text,
  company_code text,
  contact_code text,
  description text,
  amount_eur text,
  legacy_status text,
  opened_on text,
  expected_close_on text,
  historical_campaign_code text,
  fair_edition_code text,
  stand_area_sqm text,
  client_budget_eur text,
  requested_height_m text,
  brief_notes text
);
TRUNCATE staging.opportunities;

CREATE UNLOGGED TABLE IF NOT EXISTS staging.fair_editions (
  fair_edition_code text,
  fair_name text,
  city text,
  venue text,
  starts_on text,
  ends_on text,
  max_stand_height_m text
);
TRUNCATE staging.fair_editions;

CREATE UNLOGGED TABLE IF NOT EXISTS staging.activity_log (
  entry_id text,
  company_code text,
  opportunity_code text,
  activity_type text,
  occurred_at text,
  details text,
  follow_up_on text,
  completion_marker text,
  legacy_author text
);
TRUNCATE staging.activity_log;
