-- Company details repeat on every contact row for the same exhibitor in the export
-- (verified: no conflicting values across those repeats). Collapse to one row per
-- company_code, picking a deterministic representative row.
INSERT INTO company (company_code, name, province_code, region, owner_rep_id)
SELECT DISTINCT ON (c.company_code)
  c.company_code,
  c.company_name,
  c.province_code,
  c.region,
  sr.id
FROM staging.companies_and_contacts c
JOIN sales_rep sr ON sr.display_name = btrim(c.sales_rep)
ORDER BY c.company_code, c.legacy_row_id
ON CONFLICT (company_code) DO NOTHING;
