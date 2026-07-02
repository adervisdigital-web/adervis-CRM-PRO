-- ── get_client_portal: добавить agency_id для виральной ref-ссылки на портале КП ──
-- Фаза H п.11. agency_id = публичный реферальный код агентства (тот же, что в
-- app.js refUrl = origin + '?ref=' + getAgencyId()), приватности не нарушает.
-- Портал показывает «Сделано в ADERVIS CRM» со ссылкой ?ref=<agency_id>.

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
  advance_payment_id  text,
  agency_id           uuid
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
    advance_payment_id,
    agency_id
  FROM client_portals
  WHERE id = p_portal_id;
$$;

GRANT EXECUTE ON FUNCTION get_client_portal(uuid) TO anon, authenticated;
