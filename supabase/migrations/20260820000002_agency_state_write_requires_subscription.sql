-- ═══════════════════════════════════════════════════════════════════════
-- Запись в облако требует живой подписки — на СЕРВЕРЕ, а не в браузере.
--
-- Как было (проверено 2026-08-20): единственная проверка оплаты во всём
-- продукте — функция isSubscriptionActive() в app.js:2304, то есть обычный
-- `if` в браузере пользователя. Она гейтит показ приложения (app.js:13414) и
-- сохранение в облако (app.js:7674). На сервере подписку смотрит ровно одна
-- Edge Function — ai-proposal, и то потому, что каждый вызов стоит нам денег
-- за чужой API. Политики agency_state проверяли только принадлежность
-- агентству, но не оплату.
--
-- Итог: правка одной строки в devtools (или прямой запрос к PostgREST с своим
-- же токеном) возвращала истёкшей подписке полный доступ, включая облачную
-- синхронизацию. Платным продукт оставался только для тех, кто не открывал
-- инструменты разработчика.
--
-- ── Что здесь сделано ──────────────────────────────────────────────────
--
-- 1. ЧИТАТЬ по-прежнему можно ВСЕГДА. Политика «state: read agency» не
--    тронута намеренно: человек с истёкшей подпиской обязан видеть и забрать
--    свои данные. Закрыть чтение — значит запереть чужую работу за платежом,
--    это не защита, а удержание заложника.
--
-- 2. ПИСАТЬ можно, пока жива подписка СВОЯ ИЛИ ВЛАДЕЛЬЦА АГЕНТСТВА. Второе
--    обязательно: в команде подписку оплачивает владелец, а у сотрудника в
--    его собственном профиле стоит семидневный триал (app.js:1769 заводит
--    триал каждому, включая входящих по коду). Проверяли бы только свой
--    профиль — у оплаченного агентства через неделю переставали бы
--    сохраняться правки всех, кроме владельца.
--
-- 3. Условие ДОБАВЛЕНО к существующему выражению, а не написано заново:
--    строка `id = (select agency_id from profiles where id = (select auth.uid()))`
--    скопирована из прода как есть, вместе с обёрткой `(select auth.uid())` —
--    её поставил RLS performance advisor (миграция 20260703000004), чтобы
--    auth.uid() считался один раз на запрос, а не на строку.
--
-- 4. agency_state.id и profiles.agency_id — оба text (id бывает 'local' у
--    старых аккаунтов), поэтому сравнение идёт через p.id::text и приведения
--    к uuid нигде нет: на 'local' оно упало бы с invalid input syntax.
--
-- Побочный эффект, названный вслух: у просроченного аккаунта запись в облако
-- теперь действительно отказывает. Клиент туда и так не ходит (save() сам
-- проверяет подписку и сохраняет локальную копию — app.js:7674), так что в
-- эту стену упрётся только тот, кто обошёл клиентскую проверку руками.
-- ═══════════════════════════════════════════════════════════════════════

-- Живая подписка агентства: своя или владельца. Отдельная функция, а не
-- подзапрос в политике, потому что RLS исполняется в контексте authenticated,
-- а profiles закрыт политикой «read own» — чужую (владельца) строку из
-- политики видно не было бы. SECURITY DEFINER решает это, наружу при этом
-- уходит один boolean.
CREATE OR REPLACE FUNCTION public._agency_write_allowed(p_agency_id text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT public._is_super_admin() OR EXISTS (
    SELECT 1 FROM profiles p
    WHERE (p.id = (SELECT auth.uid()) OR p.id::text = p_agency_id)
      AND p.subscription_status IN ('active', 'trial')
      AND (p.subscription_expires_at IS NULL OR p.subscription_expires_at > now())
  );
$$;

-- Нужны ОБА revoke: public даёт право всем ролям скопом, anon — отдельно.
REVOKE EXECUTE ON FUNCTION public._agency_write_allowed(text) FROM public;
REVOKE EXECUTE ON FUNCTION public._agency_write_allowed(text) FROM anon;
GRANT  EXECUTE ON FUNCTION public._agency_write_allowed(text) TO authenticated;

-- Имена политик на проде — «state: insert agency» / «state: update agency»
-- (не те, что в файле 20260605000003). Сносим оба набора имён, чтобы миграция
-- не оставила рядом старую разрешающую копию.
DROP POLICY IF EXISTS "state: insert agency"  ON agency_state;
DROP POLICY IF EXISTS "state: update agency"  ON agency_state;
DROP POLICY IF EXISTS "agency_state_insert"   ON agency_state;
DROP POLICY IF EXISTS "agency_state_update"   ON agency_state;

CREATE POLICY "state: insert agency" ON agency_state
  FOR INSERT WITH CHECK (
    id = (
      SELECT profiles.agency_id FROM profiles
      WHERE profiles.id = (SELECT auth.uid())
    )
    AND public._agency_write_allowed(id)
  );

CREATE POLICY "state: update agency" ON agency_state
  FOR UPDATE USING (
    id = (
      SELECT profiles.agency_id FROM profiles
      WHERE profiles.id = (SELECT auth.uid())
    )
    AND public._agency_write_allowed(id)
  );
