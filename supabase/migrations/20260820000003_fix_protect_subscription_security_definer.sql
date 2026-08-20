-- ═══════════════════════════════════════════════════════════════════════
-- Защита полей подписки не работала НИ ДНЯ. Причина — SECURITY DEFINER.
--
-- Миграция 20260621000001 завела триггер protect_subscription_fields_trigger,
-- который должен молча откатывать клиентскую подмену subscription_status /
-- plan / expires_at. Пропуск для служебных ролей был написан так:
--
--     IF current_user IN ('service_role','postgres','supabase_admin') THEN
--       RETURN NEW;   -- вебхук ЮKassa, крон, правки из Dashboard
--     END IF;
--
-- Функция при этом объявлена SECURITY DEFINER. А внутри SECURITY DEFINER
-- current_user — это ВЛАДЕЛЕЦ функции, а не вызывающий. Владелец здесь
-- postgres, то есть условие истинно ВСЕГДА, для любого запроса, и триггер
-- на каждой строке немедленно возвращал NEW нетронутым. Два месяца (с
-- 21.06.2026) сторож существовал, значился в миграциях, выглядел рабочим —
-- и пропускал ровно то, что должен был ловить.
--
-- Проверено живьём 2026-08-20 (транзакция с rollback, роль authenticated,
-- request.jwt.claims выставлен на владельца строки):
--     before_update = 'expired'  →  after_update = 'active', до 2099-01-01.
-- То есть ЛЮБОЙ существующий пользователь одним PATCH к PostgREST со своим
-- же токеном выписывал себе бессрочную платную подписку. Не «новый аккаунт
-- в момент регистрации», как показалось по чтению кода, — любой и в любой
-- момент.
--
-- ── Решение ────────────────────────────────────────────────────────────
-- Снять SECURITY DEFINER. Права функции не нужны вовсе: тело не читает и не
-- пишет ни одной таблицы, оно только присваивает поля NEW. В режиме
-- SECURITY INVOKER current_user — настоящая роль запроса:
--   • PostgREST с anon/user JWT  → authenticated  → защита работает;
--   • Edge Functions со service-ключом → service_role → пропуск (вебхук ЮKassa
--     активирует оплату, subscription-reminder и welcome-sequence пишут свои поля);
--   • pg_cron (expire-subscriptions-daily) и SQL Editor → postgres → пропуск.
--
-- Урок на будущее, он же причина этой заметки: SECURITY DEFINER ставится
-- рефлекторно «чтобы точно хватило прав», и в функциях, которые ЧИТАЮТ чужие
-- строки (get_client_portal, _is_super_admin, _agency_write_allowed), он и
-- правда нужен. Но в любой проверке вида «а кто вызывает» он ломает саму
-- проверку, потому что подменяет ответ на этот вопрос. Триггеру, который
-- ничего не читает, он не нужен никогда.
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION protect_subscription_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- current_user здесь — РЕАЛЬНАЯ роль запроса (функция SECURITY INVOKER,
  -- см. заголовок миграции: с DEFINER тут всегда был владелец, postgres).
  IF current_user IN ('service_role', 'postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Клиент заводит себе профиль. Условия подписки назначает база, а не запрос:
    -- те же 7 дней, что ставит app.js:1735.
    NEW.subscription_status     := 'trial';
    NEW.subscription_plan       := 'pro';
    NEW.subscription_expires_at := now() + interval '7 days';
    RETURN NEW;
  END IF;

  -- UPDATE: молча восстанавливаем защищённые поля к прежним значениям
  NEW.subscription_status     := OLD.subscription_status;
  NEW.subscription_plan       := OLD.subscription_plan;
  NEW.subscription_expires_at := OLD.subscription_expires_at;

  -- referred_by_agency_id — write-once: нельзя изменить после установки
  IF OLD.referred_by_agency_id IS NOT NULL THEN
    NEW.referred_by_agency_id := OLD.referred_by_agency_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_subscription_fields_trigger ON profiles;

CREATE TRIGGER protect_subscription_fields_trigger
  BEFORE INSERT OR UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION protect_subscription_fields();
