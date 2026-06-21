-- ═══════════════════════════════════════════════════════
-- Защита полей подписки от клиентской перезаписи
--
-- Проблема: RLS-политика profiles_update_own разрешает
-- аутентифицированному пользователю менять ЛЮБЫЕ колонки
-- своего профиля, включая subscription_status/plan/expires_at.
-- Злоумышленник мог напрямую поставить subscription_status='active'.
--
-- Решение: BEFORE UPDATE триггер молча восстанавливает
-- защищённые колонки к старым значениям для всех вызовов
-- кроме service_role (webhooks ЮKassa, subscription-reminder).
-- ═══════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION protect_subscription_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- service_role, postgres, supabase_admin — разрешаем всё
  -- (ЮKassa webhook, subscription-reminder, ручные правки в Dashboard)
  IF current_user IN ('service_role', 'postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  -- Клиентский запрос: молча восстанавливаем защищённые поля
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
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION protect_subscription_fields();
