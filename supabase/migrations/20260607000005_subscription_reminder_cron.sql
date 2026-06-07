-- Daily schedule that triggers the subscription-reminder Edge Function.
-- The shared secret is read from Vault by name (not stored in this file) and
-- compared against the CRON_SECRET function secret inside the function itself —
-- the function is deployed with --no-verify-jwt because pg_cron has no Supabase
-- user JWT to send.
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'subscription-reminder-daily',
  '0 7 * * *', -- 07:00 UTC = 10:00 MSK
  $$
  select net.http_post(
    url := 'https://qzeylogyledmhjpzvgkk.supabase.co/functions/v1/subscription-reminder',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
