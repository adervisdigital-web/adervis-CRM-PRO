-- ═══════════════════════════════════════════════════════════════════════
-- Фикс race condition в agency-notify: throttle-проверка не была атомарной.
-- isThrottled() делала SELECT state_json → проверка в памяти Deno → UPSERT.
-- agency-notify — публичный эндпоинт (--no-verify-jwt, единственная защита —
-- знание portalId/agencyId из публичных ссылок). Параллельные запросы читали
-- один и тот же старый timestamp ДО того, как кто-либо из них успевал
-- записать новый — N одновременных запросов проходили throttle все разом,
-- обесценивая сам смысл лимита (защита от спама в Telegram агентства,
-- введена в Фазе D). Плюс тот же lost-update риск на весь state_json blob,
-- что и в 20260703000001 (общий с веб-CRM autosave и telegram-webhook).
-- Фикс: атомарный check-and-set одним вызовом под row lock — конкурентные
-- вызовы сериализуются самой БД, второй видит уже обновлённый throttle.
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION agency_notify_throttled(p_agency_id uuid, p_key text, p_window_ms bigint)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  st jsonb;
  last_ms bigint;
  now_ms bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
BEGIN
  SELECT state_json INTO st FROM agency_state WHERE id = p_agency_id FOR UPDATE;
  IF st IS NULL THEN st := '{}'::jsonb; END IF;

  last_ms := COALESCE((st #>> ARRAY['_notifyThrottle', p_key])::bigint, 0);
  IF now_ms - last_ms < p_window_ms THEN
    RETURN true; -- throttled — не пишем, не сбрасываем окно
  END IF;

  st := jsonb_set(st, ARRAY['_notifyThrottle', p_key], to_jsonb(now_ms), true);
  UPDATE agency_state SET state_json = st, updated_at = now() WHERE id = p_agency_id;
  RETURN false;
END;
$$;

-- Только service_role (Edge Function agency-notify). Явный REVOKE — та же
-- причина, что в 20260703000001: без него cross-tenant вызов с чужим
-- p_agency_id может быть доступен anon/authenticated по умолчанию.
REVOKE ALL ON FUNCTION agency_notify_throttled(uuid,text,bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION agency_notify_throttled(uuid,text,bigint) TO service_role;
