-- Истечение подписки по сроку: active/trial → expired.
--
-- Проблема (найдена 16.07.2026): статус 'expired' не ставил НИКТО — ни одна Edge
-- Function, ни одна миграция, ни один pg_cron (проверено на проде: три задачи —
-- письма-напоминания, дедлайны, welcome-цепочка). При этом isSubscriptionActive()
-- в app.js для 'active' возвращал true, вообще не глядя на subscription_expires_at.
-- Итог: оплатив 490₽ за один месяц, пользователь получал полный доступ навсегда,
-- а в интерфейсе бесконечно висел бейдж «⚠ 0 д.» (getSubscriptionDaysLeft зажат
-- в Math.max(0, …)). Единственным источником 'expired' был ручной тумблер в Admin
-- Panel. На момент починки платящих не было (12 профилей, все trial, 10 просрочены),
-- поэтому починка никого не отключает — она закрывает дыру до первого платежа.
--
-- Чистый SQL без Edge Function: сеть и секреты тут не нужны, в отличие от
-- subscription-reminder-daily.

-- SECURITY DEFINER с владельцем postgres — обязательное условие, а не украшение:
-- BEFORE UPDATE триггер protect_subscription_fields() МОЛЧА откатывает смену
-- subscription_status для всех ролей, кроме service_role/postgres/supabase_admin.
-- Без этого задача выполнялась бы вхолостую и без единой ошибки в логах.
CREATE OR REPLACE FUNCTION public.expire_subscriptions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n integer;
BEGIN
  UPDATE profiles
  SET subscription_status = 'expired'
  WHERE subscription_status IN ('active', 'trial')
    AND subscription_expires_at IS NOT NULL
    AND subscription_expires_at < now();
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

-- Вызывается только кроном — наружу не выставляем.
REVOKE ALL ON FUNCTION public.expire_subscriptions() FROM public, anon, authenticated;

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- Повторный прогон миграции не должен плодить дубль задачи.
SELECT cron.unschedule('expire-subscriptions-daily')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'expire-subscriptions-daily');

SELECT cron.schedule(
  'expire-subscriptions-daily',
  '10 0 * * *', -- 00:10 UTC = 03:10 МСК, задолго до утренних писем в 07:00 UTC
  $$ SELECT public.expire_subscriptions(); $$
);
