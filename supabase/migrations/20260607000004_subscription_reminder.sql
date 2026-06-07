-- Tracks when we last emailed a user about their subscription/trial ending soon,
-- so the reminder Edge Function doesn't send the same notice multiple times.
alter table profiles add column if not exists reminder_sent_at timestamptz;
