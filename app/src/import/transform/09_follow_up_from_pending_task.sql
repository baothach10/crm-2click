-- A pending task (type 'task', completion_marker 'N') is work still to do even when the
-- export recorded no explicit follow_up_on date -- it must still turn into something
-- findable, so it gets a follow-up due the day it was logged. Tasks that already have a
-- follow_up_on were already covered by 08_follow_up_from_activity.sql; excluded here to
-- avoid a duplicate, and the NOT EXISTS guard covers the same case as that file.
INSERT INTO follow_up (company_id, opportunity_id, due_on, title, assigned_rep_id, source_activity_id)
SELECT
  act.company_id,
  act.opportunity_id,
  (act.occurred_at AT TIME ZONE 'Europe/Rome')::date,
  left(a.details, 140),
  act.author_rep_id,
  act.id
FROM staging.activity_log a
JOIN activity act ON act.legacy_entry_id = a.entry_id
WHERE a.activity_type = 'task'
  AND btrim(a.completion_marker) = 'N'
  AND nullif(btrim(a.follow_up_on), '') IS NULL
  AND NOT EXISTS (SELECT 1 FROM follow_up fu WHERE fu.source_activity_id = act.id);
