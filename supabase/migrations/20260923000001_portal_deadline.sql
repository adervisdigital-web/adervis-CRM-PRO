-- Дедлайн проекта в клиентском портале.
--
-- Блок «Дедлайн в своём календаре» предлагал клиенту подписаться на дату,
-- которую сам не показывал: поля с датой в портале не было вовсе, а
-- get_client_portal его, соответственно, не отдавал. Клиент читал «дедлайн
-- проекта появится в вашем календаре» и не знал, о каком дне речь.
--
-- Колонка необязательная: у сделки может не быть срока, и это законно.
-- Клиент (app.js) умеет писать портал и БЕЗ этого поля — при ошибке про
-- deadline повторяет запись без него, как уже сделано для hide_branding и
-- pay_method. Значит, порядок наката и выкладки приложения не важен.
--
-- Проверка после наката:
--   supabase db query --linked "select deadline from public.client_portals limit 3;"

alter table public.client_portals
  add column if not exists deadline date;

-- Функция пересоздаётся целиком: returns table нельзя дополнить на месте.
drop function if exists public.get_client_portal(uuid);
create or replace function public.get_client_portal(p_portal_id uuid)
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
  hide_branding boolean,
  pay_method text,
  pay_link text,
  pay_details text,
  deadline date,
  agency_name text,
  agency_logo text,
  agency_desc text,
  agency_email text,
  agency_phone text,
  agency_site text
)
language sql
security definer
set search_path = public
as $$
  select
    p.deal_name, p.deal_status, p.total_price, p.included_text, p.excluded_text,
    p.proposal_note, p.services_list, p.approved_at, p.advance_amount,
    p.advance_paid_at, p.advance_payment_id, p.agency_id, p.signer_name,
    coalesce(p.hide_branding, false),
    coalesce(p.pay_method, 'none'), p.pay_link, p.pay_details,
    p.deadline,
    -- agency_state.id — text (это же значение стоит в ссылках на бриф), а
    -- client_portals.agency_id — uuid. Приводим портал к тексту, а не наоборот:
    -- в agency_state бывает id 'local' и его нельзя привести к uuid.
    coalesce(a.state_json -> 'company' ->> 'name', ''),
    coalesce(a.state_json -> 'company' ->> 'logoUrl', ''),
    coalesce(a.state_json -> 'company' ->> 'desc', ''),
    coalesce(a.state_json -> 'company' ->> 'email', ''),
    coalesce(a.state_json -> 'company' ->> 'phone', ''),
    coalesce(a.state_json -> 'company' ->> 'site', '')
  from public.client_portals p
  left join public.agency_state a on a.id = p.agency_id::text
  where p.id = p_portal_id;
$$;
grant execute on function public.get_client_portal(uuid) to anon, authenticated;
