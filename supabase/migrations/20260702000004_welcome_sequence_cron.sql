-- Ежедневный запуск онбординг-цепочки welcome-sequence (day-1/3/6).
-- 08:00 UTC = 11:00 МСК, отдельно от subscription-reminder (07:00 UTC).
-- Секрет читается из Vault по имени 'cron_secret' и сверяется с CRON_SECRET внутри
-- функции (задеплоена с --no-verify-jwt, т.к. pg_cron не шлёт Supabase JWT).
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'welcome-sequence-daily',
  '0 8 * * *',
  $$
  select net.http_post(
    url := 'https://qzeylogyledmhjpzvgkk.supabase.co/functions/v1/welcome-sequence',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
