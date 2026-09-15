-- legacy_status spelling varies in case and whitespace (e.g. "Open", " open ", "OPEN").
-- Normalise on lower(btrim(...)); any value that still doesn't match a known status is
-- left NULL here and reported as an import_issue by run.ts (the row is skipped, not guessed).
--
-- requested_height_m is intentionally NOT checked against the fair edition's height limit
-- here: the archive contains, and the handoff policy must see, requests that exceed it.
WITH mapped AS (
  SELECT
    o.*,
    CASE lower(btrim(o.legacy_status))
      WHEN 'open' THEN 'open'
      WHEN 'qualified' THEN 'qualified'
      WHEN 'proposal' THEN 'proposal'
      WHEN 'won' THEN 'won'
      WHEN 'lost' THEN 'lost'
      ELSE NULL
    END::opportunity_status AS status_mapped
  FROM staging.opportunities o
)
INSERT INTO opportunity (
  opportunity_code, company_id, contact_id, fair_edition_id, description, amount_eur,
  status, legacy_status_raw, opened_on, expected_close_on, historical_campaign_code,
  stand_area_sqm, client_budget_eur, requested_height_m, brief_notes
)
SELECT
  m.opportunity_code,
  co.id,
  ct.id,
  fe.id,
  m.description,
  replace(nullif(btrim(m.amount_eur), ''), ',', '.')::numeric,
  m.status_mapped,
  m.legacy_status,
  to_date(nullif(btrim(m.opened_on), ''), 'DD/MM/YYYY'),
  to_date(nullif(btrim(m.expected_close_on), ''), 'DD/MM/YYYY'),
  nullif(btrim(m.historical_campaign_code), ''),
  replace(nullif(btrim(m.stand_area_sqm), ''), ',', '.')::numeric,
  replace(nullif(btrim(m.client_budget_eur), ''), ',', '.')::numeric,
  replace(nullif(btrim(m.requested_height_m), ''), ',', '.')::numeric,
  m.brief_notes
FROM mapped m
JOIN company co ON co.company_code = m.company_code
LEFT JOIN contact ct ON ct.contact_code = nullif(btrim(m.contact_code), '')
JOIN fair_edition fe ON fe.edition_code = m.fair_edition_code
WHERE m.status_mapped IS NOT NULL
ON CONFLICT (opportunity_code) DO NOTHING;
