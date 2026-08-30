-- ═══════════════════════════════════════════════════════════════════════
-- Метка пользователя для админки: «Амбассадор», «Партнёр», «Тест» и т.п.
--
-- Зачем (просьба владельца 29.08.2026). В списке пользователей нельзя отличить
-- амбассадора с подаренным годом от обычной регистрации, а решения принимаются
-- именно по этому: кому продлевать бесплатно, кого считать рыночным сигналом,
-- кому не писать в рассылке. Сейчас это знание держится в голове и в чатах.
--
-- Метка — СВОБОДНЫЙ ТЕКСТ, а не enum: набор ролей на этом этапе ещё меняется
-- (сегодня «амбассадор», завтра «пилот», «партнёр», «свой аккаунт»), и каждая
-- новая роль не должна стоить миграции. Витрину подсказок держит клиент.
--
-- Приватность: поле видно и правится ТОЛЬКО супер-админом (обе функции ниже
-- начинаются с _is_super_admin()). Самому пользователю оно не отдаётся ни одним
-- запросом: profiles он читает своей политикой, где этой колонки в выборке нет.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.profiles add column if not exists admin_tag text;

comment on column public.profiles.admin_tag is
  'Метка для админки (амбассадор, партнёр, тест). Ставит только супер-админ.';

-- ── Чтение: та же функция, что и была, плюс одна колонка ────────────────
-- Тело скопировано с ПРОДА (pg_get_functiondef) и дополнено, а не написано
-- по памяти: 19.08 на переписывании такой же функции едва не потерялись
-- белые списки полей.

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

-- ── Запись: только супер-админ ──────────────────────────────────────────
-- Отдельная функция, а не UPDATE из браузера: profiles защищён политиками и
-- триггером protect_subscription_fields, и открывать туда путь ради одной
-- метки нельзя. Пустая строка стирает метку.

CREATE OR REPLACE FUNCTION public.admin_set_user_tag(p_user_id uuid, p_tag text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT _is_super_admin() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  UPDATE public.profiles
     SET admin_tag = NULLIF(btrim(COALESCE(p_tag, '')), '')
   WHERE id = p_user_id;
END;
$function$;

-- Нужны ОБА revoke: public даёт право всем ролям скопом, anon — отдельно.
REVOKE ALL ON FUNCTION public.admin_set_user_tag(uuid, text) FROM public;
REVOKE ALL ON FUNCTION public.admin_set_user_tag(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_set_user_tag(uuid, text) TO authenticated;
