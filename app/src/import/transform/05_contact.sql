-- legacy_print_layout is obsolete presentation metadata from the previous system and
-- carries no commercial information; deliberately not copied anywhere.
INSERT INTO contact (contact_code, company_id, legacy_row_id, first_name, last_name, email, phone, fax)
SELECT
  c.contact_code,
  co.id,
  c.legacy_row_id,
  c.contact_first_name,
  c.contact_last_name,
  nullif(btrim(c.email), ''),
  nullif(btrim(c.phone), ''),
  nullif(btrim(c.fax), '')
FROM staging.companies_and_contacts c
JOIN company co ON co.company_code = c.company_code
ON CONFLICT (contact_code) DO NOTHING;
