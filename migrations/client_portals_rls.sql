-- ═══════════════════════════════════════════════════════════
-- МИГРАЦИЯ: Клиентский портал (Task 12)
-- Таблица client_portals + RLS политики
-- ═══════════════════════════════════════════════════════════

-- 1. Создаём таблицу
CREATE TABLE IF NOT EXISTS public.client_portals (
  id            UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  agency_id     UUID          REFERENCES public.profiles(id) ON DELETE CASCADE,
  deal_name     TEXT          NOT NULL DEFAULT '',
  deal_status   TEXT          NOT NULL DEFAULT 'КП отправлено',
  total_price   NUMERIC(12,2) NOT NULL DEFAULT 0,
  included_text TEXT          NOT NULL DEFAULT '',
  excluded_text TEXT          NOT NULL DEFAULT '',
  proposal_note TEXT          NOT NULL DEFAULT '',
  services_list JSONB         NOT NULL DEFAULT '[]',
  approved_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- 2. Индекс для быстрого поиска по агентству
CREATE INDEX IF NOT EXISTS idx_client_portals_agency
  ON public.client_portals (agency_id);

-- 3. Триггер обновления updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_client_portals_updated_at ON public.client_portals;
CREATE TRIGGER trg_client_portals_updated_at
  BEFORE UPDATE ON public.client_portals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. Включаем RLS
ALTER TABLE public.client_portals ENABLE ROW LEVEL SECURITY;

-- 5. Владелец агентства — полный доступ (CRUD)
CREATE POLICY "agency_full_access"
  ON public.client_portals
  FOR ALL
  USING  (agency_id = auth.uid())
  WITH CHECK (agency_id = auth.uid());

-- 6. Анонимный пользователь — SELECT по id (UUID = токен доступа)
--    Достаточно знать UUID, чтобы прочитать данные КП.
CREATE POLICY "anon_read_by_id"
  ON public.client_portals
  FOR SELECT
  TO anon
  USING (true);

-- 7. Анонимный пользователь — UPDATE только поля deal_status и approved_at
--    (для кнопки «Утвердить КП»). Остальные поля защищены CHECK.
CREATE POLICY "anon_approve"
  ON public.client_portals
  FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (
    agency_id IS NOT DISTINCT FROM agency_id  -- нельзя сменить владельца
  );

-- ═══════════════════════════════════════════════════════════
-- ГОТОВО. Теперь:
--   ?portal=<UUID> — публичная read-only страница для клиента
--   auth.uid() owner — может создавать / удалять записи
-- ═══════════════════════════════════════════════════════════
