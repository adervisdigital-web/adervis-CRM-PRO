-- Add column to track the last successful YooKassa payment ID per user
alter table public.profiles
  add column if not exists yookassa_last_payment_id text;
