-- «Сделано в ADERVIS CRM» на клиентском портале КП — возможность скрыть на платном тарифе.
--
-- Подпись со ссылкой (app.js, renderClientPortal) — бесплатный канал распространения:
-- КП видит заказчик студии. На платном тарифе студия вправе её убрать (white-label),
-- на бесплатном — нет. Флаг фиксируется НА МОМЕНТ СОЗДАНИЯ портала и живёт в строке
-- client_portals, а не в состоянии агентства: портал читает аноним через
-- get_client_portal, доступа к agency_state у него нет и быть не должно.
--
-- Значение по умолчанию false — все уже созданные КП продолжают показывать подпись.

alter table client_portals add column if not exists hide_branding boolean not null default false;

-- Изменение состава RETURNS TABLE требует DROP + CREATE (CREATE OR REPLACE не меняет
-- тип возврата). Остальные 13 колонок — как в 20260716000001, без изменений.
drop function if exists get_client_portal(uuid);
create or replace function get_client_portal(p_portal_id uuid)
returns table(
  deal_name text,
  deal_status text,
  total_price integer,
  included_text text,
  excluded_text text,
  proposal_note text,
  services_list jsonb,
  approved_at timestamptz,
  advance_amount integer,
  advance_paid_at timestamptz,
  advance_payment_id text,
  agency_id uuid,
  signer_name text,
  hide_branding boolean
)
language sql
security definer
set search_path = public
as $$
  select
    deal_name, deal_status, total_price, included_text, excluded_text,
    proposal_note, services_list, approved_at, advance_amount,
    advance_paid_at, advance_payment_id, agency_id, signer_name,
    coalesce(hide_branding, false)
  from client_portals
  where id = p_portal_id;
$$;
grant execute on function get_client_portal(uuid) to anon, authenticated;
