-- ═══════════════════════════════════════════════════════
-- Ежедневный cron-job для Web Push о дедлайнах
-- 09:00 UTC = 12:00 МСК
-- Выполни в Supabase Dashboard → SQL Editor
-- ═══════════════════════════════════════════════════════

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net  with schema extensions;

select cron.schedule(
  'deadline-push-daily',
  '0 9 * * *', -- 09:00 UTC = 12:00 МСК
  $$
  select net.http_post(
    url     := 'https://qzeylogyledmhjpzvgkk.supabase.co/functions/v1/deadline-push-notify',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body    := '{}'::jsonb
  );
  $$
);
