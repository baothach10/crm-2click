-- to_timestamp(...) interprets its fields using the session's TimeZone setting, so a bare
-- to_timestamp(...)::timestamptz would silently depend on the connection's configured zone.
-- The portable, TZ-independent way to read "these digits are a Europe/Rome wall-clock time":
-- parse to a naive `timestamp` (round-tripping through to_timestamp()::timestamp cancels out
-- whatever session TimeZone is in effect), then reinterpret that naive value AT TIME ZONE
-- 'Europe/Rome', which correctly accounts for the CET/CEST switch by calendar date.
INSERT INTO activity (
  legacy_entry_id, company_id, opportunity_id, type, occurred_at, details, author_rep_id, is_completed
)
SELECT
  a.entry_id,
  co.id,
  op.id,
  a.activity_type::activity_type,
  (to_timestamp(a.occurred_at, 'DD/MM/YYYY HH24:MI')::timestamp) AT TIME ZONE 'Europe/Rome',
  a.details,
  sr.id,
  CASE btrim(a.completion_marker)
    WHEN 'Y' THEN true
    WHEN 'N' THEN false
    ELSE NULL
  END
FROM staging.activity_log a
JOIN company co ON co.company_code = a.company_code
LEFT JOIN opportunity op ON op.opportunity_code = nullif(btrim(a.opportunity_code), '')
JOIN sales_rep sr ON sr.legacy_username = btrim(a.legacy_author)
ON CONFLICT (legacy_entry_id) DO NOTHING;
