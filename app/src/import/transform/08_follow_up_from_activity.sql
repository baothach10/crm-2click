-- Any activity (completed or not, any type) that carries a follow_up_on date represents a
-- commitment someone needs to act on later -- e.g. a completed call where the customer
-- promised to confirm the floor area on Friday. The NOT EXISTS guard makes this safe to
-- run again without duplicating follow-ups if an import is ever repeated.
INSERT INTO follow_up (company_id, opportunity_id, due_on, title, assigned_rep_id, source_activity_id)
SELECT
  act.company_id,
  act.opportunity_id,
  to_date(a.follow_up_on, 'DD/MM/YYYY'),
  left(a.details, 140),
  act.author_rep_id,
  act.id
FROM staging.activity_log a
JOIN activity act ON act.legacy_entry_id = a.entry_id
WHERE nullif(btrim(a.follow_up_on), '') IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM follow_up fu WHERE fu.source_activity_id = act.id);
