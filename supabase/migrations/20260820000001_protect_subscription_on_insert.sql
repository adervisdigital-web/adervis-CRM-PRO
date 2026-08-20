-- ═══════════════════════════════════════════════════════════════════════
-- Поля подписки защищены и при ВСТАВКЕ, а не только при обновлении.
--
-- Дыра (проверена на проде 2026-08-20, до этой миграции):
--   • триггер protect_subscription_fields_trigger стоял BEFORE UPDATE — и только;
--   • политика «profiles: insert own» проверяет ровно auth.uid() = id, без
--     единого ограничения на колонки;
--   • строку профиля создаёт КЛИЕНТ (app.js, upsert в _loadUserProfile), DB-триггера
--     на auth.users в проекте нет вовсе.
-- Итог: любой, кто только что завёл аккаунт (регистрация свободная, anon-ключ
-- публичный по построению), вставлял себе первую строку профиля сразу со
-- subscription_status='active' и expires_at='2099-01-01'. UPDATE после этого уже
-- защищён, политики DELETE нет — строка становилась несменяемой. Бессрочный
-- платный доступ за ноль рублей, вся «подписка» обходилась одним POST.
--
-- Существующего пользователя это не касалось: его строка уже есть, вставка
-- упирается в PK. Окно ровно одно — первая вставка нового аккаунта. Но новый
-- аккаунт заводится за минуту, так что окно всегда открыто.
--
-- ── Решение ────────────────────────────────────────────────────────────
-- Тот же триггер, что уже сторожит UPDATE, вешаем и на INSERT. На вставке
-- клиенту нечего «восстанавливать» (OLD не существует), поэтому условия
-- задаются жёстко: пробный период, тариф pro, 7 дней — те же значения, что
-- ставит app.js:1735 (`Date.now() + 7 * 86400000`). Что бы клиент ни прислал
-- в этих трёх колонках, в базу ложится триал.
--
-- service_role / postgres / supabase_admin по-прежнему пропускаются целиком:
-- через них ходят вебхук ЮKassa (активация оплаты), subscription-reminder,
-- expire-subscriptions и ручные правки из Dashboard. Иначе оплата перестала бы
-- активироваться — ровно тот же список исключений, что и был у UPDATE.
--
-- Ссылка на OLD внутри INSERT-ветки плпгсэкла падает («record old is not
-- assigned yet»), поэтому ветки разведены по TG_OP явно, а не по IF OLD IS NULL.
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION protect_subscription_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- service_role, postgres, supabase_admin — разрешаем всё
  -- (ЮKassa webhook, subscription-reminder, ручные правки в Dashboard)
  IF current_user IN ('service_role', 'postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Клиент заводит себе профиль. Условия подписки назначает база, а не запрос.
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
