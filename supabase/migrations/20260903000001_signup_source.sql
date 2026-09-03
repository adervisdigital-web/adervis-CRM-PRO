-- ═══════════════════════════════════════════════════════════════════════
-- Источник регистрации: из какого канала пришёл человек.
--
-- Зачем. Раздел «Продвижение» (Admin Panel) умеет считать продажи и воронку, но
-- на вопрос «сколько людей пришло из Telegram» ответить не может: источник
-- НИГДЕ не сохранялся. Пока его нет, канальная аналитика — это экран с нулями,
-- а решение «в какой канал вкладывать время» принимается на ощупь.
--
-- ── Почему колонка, а не отдельная таблица ─────────────────────────────
-- Источник у человека ОДИН и на всю жизнь аккаунта: это ответ на вопрос «откуда
-- он пришёл», а не история визитов. Таблица визитов — другая задача (её решает
-- Метрика), и заводить её ради одного значения на строку значит платить джойном
-- в каждом отчёте.
--
-- ── Write-once, как referred_by_agency_id ──────────────────────────────
-- Значение ставится ОДИН раз, при создании профиля, и после этого не меняется
-- даже своим же токеном. Иначе любой пользователь мог бы переписать себе
-- источник PATCH-запросом к PostgREST, и отчёт по каналам стал бы отчётом о том,
-- что люди написали в своих профилях. Защиту вешаем на тот же триггер, который
-- уже держит подписку и реферера — второй сторож на ту же таблицу расходился бы
-- с первым (ровно так 21.06 появился триггер, который два месяца ничего не
-- проверял, см. 20260820000003).
--
-- ЗАЩИТА ОТ МУСОРА. Источник приходит из адресной строки, то есть от кого
-- угодно: `?utm_source=` можно набрать руками любой длины и с любым содержимым.
-- Режем до 40 символов и до [a-z0-9_-] прямо здесь, в базе: клиент к этому
-- моменту уже не единственный путь записи, а отчёт по каналам не должен
-- разъезжаться от регистра и пробелов («Telegram», «telegram », «TELEGRAM»).
-- ═══════════════════════════════════════════════════════════════════════

alter table public.profiles add column if not exists signup_source text;

comment on column public.profiles.signup_source is
  'Канал, из которого пришёл человек (utm_source при первом визите). Ставится один раз при создании профиля, дальше неизменен.';

-- Отчёт по каналам всегда идёт группировкой по этой колонке.
create index if not exists profiles_signup_source_idx
  on public.profiles (signup_source)
  where signup_source is not null;

-- ── Нормализация и защита ──────────────────────────────────────────────

create or replace function public._normalize_signup_source(p text)
returns text
language sql
immutable
set search_path = public
as $$
  select nullif(
    substring(
      regexp_replace(lower(coalesce(p, '')), '[^a-z0-9_-]+', '_', 'g')
      from 1 for 40
    ),
    ''
  );
$$;

-- Нужны ОБА revoke: `from public` не снимает право, выданное anon отдельно.
-- Зовёт функцию только триггер под ролью authenticated (service_role и postgres
-- выходят из триггера раньше), поэтому больше никому она не нужна.
revoke all on function public._normalize_signup_source(text) from public;
revoke all on function public._normalize_signup_source(text) from anon;
grant execute on function public._normalize_signup_source(text) to authenticated;

/* Тело триггера скопировано с ПРОДА (20260820000003) и ДОПОЛНЕНО, а не написано
   по памяти: на переписывании таких функций уже едва не терялись белые списки
   полей. Новое здесь — только две ветки про signup_source. */
CREATE OR REPLACE FUNCTION protect_subscription_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- current_user здесь — РЕАЛЬНАЯ роль запроса (функция SECURITY INVOKER,
  -- с DEFINER тут всегда был владелец, postgres — см. 20260820000003).
  IF current_user IN ('service_role', 'postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Клиент заводит себе профиль. Условия подписки назначает база, а не запрос:
    -- те же 7 дней, что ставит app.js.
    NEW.subscription_status     := 'trial';
    NEW.subscription_plan       := 'pro';
    NEW.subscription_expires_at := now() + interval '7 days';
    -- Источник чистим здесь: дальше он неизменен, и мусор осел бы навсегда.
    NEW.signup_source           := public._normalize_signup_source(NEW.signup_source);
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

  /* signup_source — тоже write-once. Пустой источник дозаполнить можно (профиль
     мог создаться до этой миграции), а уже проставленный не переписывается:
     иначе отчёт по каналам показывал бы не то, откуда люди пришли, а то, что
     они у себя в профиле проставили. */
  IF OLD.signup_source IS NOT NULL THEN
    NEW.signup_source := OLD.signup_source;
  ELSE
    NEW.signup_source := public._normalize_signup_source(NEW.signup_source);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_subscription_fields_trigger ON profiles;

CREATE TRIGGER protect_subscription_fields_trigger
  BEFORE INSERT OR UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION protect_subscription_fields();

-- ── Админка: та же функция, плюс одна колонка ──────────────────────────
-- Тело скопировано с прода и дополнено (см. 20260829000001).

CREATE OR REPLACE FUNCTION public.admin_get_all_users()
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE result json;
BEGIN
  IF NOT _is_super_admin() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  SELECT json_agg(row_to_json(r))
  INTO result
  FROM (
    SELECT
      u.id::text            AS id,
      u.email               AS email,
      p.agency_id::text     AS agency_id,
      p.subscription_status AS subscription_status,
      p.subscription_plan   AS subscription_plan,
      p.subscription_expires_at,
      p.admin_tag           AS admin_tag,
      p.signup_source       AS signup_source,
      u.created_at,
      u.last_sign_in_at,
      (u.email_confirmed_at IS NOT NULL) AS email_confirmed
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.id = u.id
    ORDER BY u.created_at DESC
  ) r;
  RETURN COALESCE(result, '[]'::json);
END;
$function$;
