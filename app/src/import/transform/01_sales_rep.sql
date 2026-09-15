-- Legacy usernames (activity_log.legacy_author, e.g. "a.morgan") and display names
-- (companies_and_contacts.sales_rep, e.g. "Alex Morgan") are two names for the same six
-- people. Derive the username from the display name; run.ts verifies the derived set
-- exactly matches the usernames actually seen in the activity log and fails loudly if not.
INSERT INTO sales_rep (legacy_username, display_name)
SELECT
  lower(left(split_part(display_name, ' ', 1), 1)) || '.' || lower(split_part(display_name, ' ', 2)),
  display_name
FROM (
  SELECT DISTINCT btrim(sales_rep) AS display_name
  FROM staging.companies_and_contacts
  WHERE btrim(sales_rep) <> ''
) distinct_reps
ON CONFLICT (display_name) DO NOTHING;
