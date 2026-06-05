-- ═══════════════════════════════════════════════════════
-- RLS: полная изоляция данных по agency_id
-- Выполни в Supabase Dashboard → SQL Editor
-- ═══════════════════════════════════════════════════════

-- ── agency_state ────────────────────────────────────────
ALTER TABLE agency_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agency_state_select" ON agency_state;
DROP POLICY IF EXISTS "agency_state_insert" ON agency_state;
DROP POLICY IF EXISTS "agency_state_update" ON agency_state;
DROP POLICY IF EXISTS "agency_state_delete" ON agency_state;

-- Пользователь может читать только строку своего агентства
CREATE POLICY "agency_state_select" ON agency_state
  FOR SELECT USING (
    id = (
      SELECT agency_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Пользователь может создавать строку только для своего агентства
CREATE POLICY "agency_state_insert" ON agency_state
  FOR INSERT WITH CHECK (
    id = (
      SELECT agency_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Пользователь может обновлять только строку своего агентства
CREATE POLICY "agency_state_update" ON agency_state
  FOR UPDATE USING (
    id = (
      SELECT agency_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Пользователь может удалять только строку своего агентства
CREATE POLICY "agency_state_delete" ON agency_state
  FOR DELETE USING (
    id = (
      SELECT agency_id FROM profiles WHERE id = auth.uid()
    )
  );

-- ── profiles ─────────────────────────────────────────────
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_own" ON profiles;
DROP POLICY IF EXISTS "profiles_select_agency" ON profiles;
DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;

-- Пользователь видит свой профиль и профили коллег по агентству
CREATE POLICY "profiles_select_agency" ON profiles
  FOR SELECT USING (
    agency_id = (
      SELECT agency_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Только сам пользователь создаёт свой профиль
CREATE POLICY "profiles_insert_own" ON profiles
  FOR INSERT WITH CHECK (id = auth.uid());

-- Только сам пользователь обновляет свой профиль
CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE USING (id = auth.uid());

-- ── deals (если таблица существует) ─────────────────────
-- Создаём таблицу если нет (на случай что ещё не создана)
CREATE TABLE IF NOT EXISTS deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL,
  data jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE deals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deals_agency" ON deals;

CREATE POLICY "deals_agency" ON deals
  FOR ALL USING (
    agency_id = (
      SELECT agency_id FROM profiles WHERE id = auth.uid()
    )
  ) WITH CHECK (
    agency_id = (
      SELECT agency_id FROM profiles WHERE id = auth.uid()
    )
  );

-- ── clients (если таблица существует) ───────────────────
CREATE TABLE IF NOT EXISTS clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL,
  data jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clients_agency" ON clients;

CREATE POLICY "clients_agency" ON clients
  FOR ALL USING (
    agency_id = (
      SELECT agency_id FROM profiles WHERE id = auth.uid()
    )
  ) WITH CHECK (
    agency_id = (
      SELECT agency_id FROM profiles WHERE id = auth.uid()
    )
  );
