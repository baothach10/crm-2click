CREATE TYPE opportunity_status AS ENUM ('open', 'qualified', 'proposal', 'won', 'lost');
CREATE TYPE activity_type AS ENUM ('call', 'email', 'meeting', 'note', 'task');
CREATE TYPE handoff_decision AS ENUM (
  'ready_for_technical',
  'early_notice_only',
  'blocked_missing_info',
  'blocked_conflict'
);
