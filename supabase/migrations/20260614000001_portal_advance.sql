-- ═══════════════════════════════════════════════════════
-- Оплата аванса в клиентском портале
-- Выполни в Supabase Dashboard → SQL Editor
-- ═══════════════════════════════════════════════════════

-- 1. Добавляем колонки в client_portals
ALTER TABLE client_portals
  ADD COLUMN IF NOT EXISTS advance_amount   integer     DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS advance_paid_at  timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS advance_payment_id text      DEFAULT NULL;

-- 2. Пересоздаём функцию get_client_portal с новыми полями
--    (DROP нужен: нельзя менять RETURNS без него)
DROP FUNCTION IF EXISTS get_client_portal(uuid);

CREATE OR REPLACE FUNCTION get_client_portal(p_portal_id uuid)
RETURNS TABLE (
  deal_name           text,
  deal_status         text,
  total_price         integer,
  included_text       text,
  excluded_text       text,
  proposal_note       text,
  services_list       jsonb,
  approved_at         timestamptz,
  advance_amount      integer,
  advance_paid_at     timestamptz,
  advance_payment_id  text
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    deal_name,
    deal_status,
    total_price,
    included_text,
    excluded_text,
    proposal_note,
    services_list,
    approved_at,
    advance_amount,
    advance_paid_at,
    advance_payment_id
  FROM client_portals
  WHERE id = p_portal_id;
$$;

-- 3. Функция для фиксации оплаты аванса (вызывается из webhook через service_role)
CREATE OR REPLACE FUNCTION mark_portal_advance_paid(
  p_portal_id   uuid,
  p_payment_id  text
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE client_portals
  SET
    advance_paid_at     = now(),
    advance_payment_id  = p_payment_id
  WHERE id = p_portal_id
    AND advance_paid_at IS NULL; -- идемпотентность: не перезаписываем уже оплаченное
$$;
