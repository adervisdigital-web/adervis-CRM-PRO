-- ═══════════════════════════════════════════════════════════════════════
-- Ремедиация находок `supabase db advisors --type performance` (03.07.2026)
--
-- Не безопасность (в отличие от 20260703000003) — производительность RLS
-- при масштабе. Сейчас некритично (0 платящих, таблицы почти пустые), но
-- дёшево и безопасно исправить сейчас, пока не накопился объём данных.
--
-- 1) `public.profiles` имел ДВЕ пары идентичных permissive-политик на
--    INSERT/SELECT/UPDATE ("profiles: X own" и "users X own profile") —
--    проверено через pg_policy: тексты USING/WITH CHECK побайтово одинаковы
--    ((select auth.uid()) = id), это не дыра вроде найденной раньше в
--    20260607000003 (там одна из дублирующихся политик была ШИРЕ другой),
--    просто двойное вычисление на каждой строке. Ни один из двух наборов
--    имён не совпадает с файлами миграций — оба были созданы вручную через
--    Dashboard в разное время (тот же паттерн drift, что и с admin_*
--    функциями в 20260703000003). Удаляем более новый по алфавиту дубль
--    ("users ... own profile"), оставляем "profiles: ... own".
--
-- 2) 12 RLS-политик вызывали `auth.uid()` "голым" — Postgres переоценивает
--    такой вызов на КАЖДОЙ строке результата. Обёртка `(select auth.uid())`
--    позволяет планировщику посчитать его один раз (initplan) на весь
--    запрос — стандартная рекомендация Supabase, семантика не меняется
--    (auth.uid() — STABLE-функция, значение то же в пределах транзакции).
--    Точные тексты политик сверены через pg_policy (файлы миграций снова
--    разошлись с прод-схемой: agency_state использует имена "state: X
--    agency", а не "agency_state_X" из 20260605000003_rls_data_isolation.sql
--    — те, судя по всему, тоже были пересозданы вручную позже).
--
-- Найдено через: supabase db advisors --linked --type performance
-- ═══════════════════════════════════════════════════════════════════════

-- ─── 1. Убрать дублирующиеся политики на profiles ────────────────────────
DROP POLICY IF EXISTS "users insert own profile" ON profiles;
DROP POLICY IF EXISTS "users read own profile"   ON profiles;
DROP POLICY IF EXISTS "users update own profile" ON profiles;

-- ─── 2. auth.uid() → (select auth.uid()) во всех оставшихся политиках ───

-- profiles
ALTER POLICY "profiles: insert own" ON profiles
  WITH CHECK ((select auth.uid()) = id);
ALTER POLICY "profiles: read own" ON profiles
  USING ((select auth.uid()) = id);
ALTER POLICY "profiles: update own" ON profiles
  USING ((select auth.uid()) = id);

-- agency_state
ALTER POLICY "state: insert agency" ON agency_state
  WITH CHECK (id = (SELECT profiles.agency_id FROM profiles WHERE profiles.id = (select auth.uid())));
ALTER POLICY "state: read agency" ON agency_state
  USING (id = (SELECT profiles.agency_id FROM profiles WHERE profiles.id = (select auth.uid())));
ALTER POLICY "state: update agency" ON agency_state
  USING (id = (SELECT profiles.agency_id FROM profiles WHERE profiles.id = (select auth.uid())));

-- brief_submissions (agency_id — исторически text, сравнение через ::text)
ALTER POLICY "agency owner can delete briefs" ON brief_submissions
  USING ((agency_id = ((select auth.uid()))::text) OR (agency_id IN (SELECT profiles.agency_id FROM profiles WHERE profiles.id = (select auth.uid()))));
ALTER POLICY "agency owner can select briefs" ON brief_submissions
  USING ((agency_id = ((select auth.uid()))::text) OR (agency_id IN (SELECT profiles.agency_id FROM profiles WHERE profiles.id = (select auth.uid()))));
ALTER POLICY "agency owner can update briefs" ON brief_submissions
  USING ((agency_id = ((select auth.uid()))::text) OR (agency_id IN (SELECT profiles.agency_id FROM profiles WHERE profiles.id = (select auth.uid()))));

-- client_portals
ALTER POLICY "agency_full_access" ON client_portals
  USING (agency_id = (select auth.uid()))
  WITH CHECK (agency_id = (select auth.uid()));

-- referrals
ALTER POLICY "referrals_select_own" ON referrals
  USING (referrer_agency_id = (SELECT profiles.agency_id FROM profiles WHERE profiles.id = (select auth.uid())));

-- push_subscriptions
ALTER POLICY "push_own_agency" ON push_subscriptions
  USING (agency_id = (SELECT profiles.agency_id FROM profiles WHERE profiles.id = (select auth.uid())))
  WITH CHECK (agency_id = (SELECT profiles.agency_id FROM profiles WHERE profiles.id = (select auth.uid())));
