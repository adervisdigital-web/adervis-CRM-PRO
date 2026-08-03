-- ═══════════════════════════════════════════════════════════════════════
-- Гигиена доступа: убрать из публичного API две функции и запинить search_path.
--
-- Найдено аудитом 2026-08-03. УТЕЧКИ НЕТ: обе функции начинаются с auth.uid(),
-- у анонима он null — rotate_calendar_token падает с «not authenticated»,
-- telegram_notify_rate_limit возвращает false. Но функции, работающие «от имени
-- вошедшего», не должны быть вызываемы анонимом вовсе.
--
-- Почему прошлые revoke не сработали: право на EXECUTE приходит С ДВУХ СТОРОН —
--   1) PostgreSQL сам выдаёт его псевдороли PUBLIC на любую новую функцию;
--      anon входит в PUBLIC, поэтому `revoke ... from anon` не помогает;
--   2) Supabase держит default privileges для anon/authenticated, поэтому
--      `revoke ... from public` тоже не помогает в одиночку.
-- Нужны ОБА revoke. В 20260730000001 стоял только `from anon` — не сработало;
-- в 20260803000001 только `from public` — тоже, потребовался 20260803000002.
--
-- Проверка после наката (401 = право снято):
--   curl -s -o /dev/null -w "%{http_code}\n" -X POST \
--     "https://qzeylogyledmhjpzvgkk.supabase.co/rest/v1/rpc/rotate_calendar_token" \
--     -H "apikey: <publishable-ключ>" -H "Content-Type: application/json" -d '{}'
-- ═══════════════════════════════════════════════════════════════════════

-- 1. Ротация токена iCal-фида — только для вошедшего владельца.
revoke execute on function public.rotate_calendar_token() from public;
revoke execute on function public.rotate_calendar_token() from anon;
grant  execute on function public.rotate_calendar_token() to authenticated;

-- 2. Счётчик лимита Telegram-уведомлений — вызывается только из клиента агентства.
revoke execute on function public.telegram_notify_rate_limit(bigint, int) from public;
revoke execute on function public.telegram_notify_rate_limit(bigint, int) from anon;
grant  execute on function public.telegram_notify_rate_limit(bigint, int) to authenticated;

-- 3. protect_subscription_fields — единственная SECURITY DEFINER без пина
--    search_path (советник: function_search_path_mutable). Это триггер на profiles,
--    защищающий поля подписки, calendar_token и referred_by_agency_id от правки
--    клиентским UPDATE. Без пина имена таблиц внутри резолвятся по search_path
--    вызывающего — при возможности создать свою схему поведение триггера можно
--    подменить. Тело не меняем, добавляем только `set search_path`.
--
--    ВНИМАНИЕ: тело обязано совпадать с 20260730000001_calendar_feed_token.sql —
--    если там появятся новые защищённые поля, продублировать и здесь.
create or replace function protect_subscription_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_user in ('service_role', 'postgres', 'supabase_admin') then
    return new;
  end if;

  new.subscription_status     := old.subscription_status;
  new.subscription_plan       := old.subscription_plan;
  new.subscription_expires_at := old.subscription_expires_at;
  new.calendar_token          := old.calendar_token;

  if old.referred_by_agency_id is not null then
    new.referred_by_agency_id := old.referred_by_agency_id;
  end if;

  return new;
end;
$$;

-- Остаётся в советнике осознанно и после этой миграции:
--   get_client_portal / approve_client_portal — anon по замыслу (заказчик открывает
--     КП без входа, ключ доступа — сам UUID ссылки);
--   get_brief_template — anon по замыслу (публичная форма брифа);
--   brief_submissions / client_errors с INSERT WITH CHECK (true) — публичные приёмники;
--   auth_leaked_password_protection — включается галочкой в дашборде Supabase,
--     не SQL: Authentication → Policies → Leaked password protection.
