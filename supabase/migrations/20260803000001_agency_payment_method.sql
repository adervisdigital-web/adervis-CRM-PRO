-- ═══════════════════════════════════════════════════════════════════════
-- Способ оплаты аванса задаёт САМО агентство.
--
-- До этой миграции create-portal-payment брал магазин ЮKassa из глобальных
-- секретов, то есть из магазина владельца сервиса. Для чужой студии это значит:
-- её клиент платит аванс — деньги приходят владельцу сервиса, студия их не
-- видит, а у владельца (самозанятый) чужая выручка ложится в его лимит по НПД.
--
-- Форма у всех разная (ИП, ООО, самозанятый), поэтому единого эквайринга нет:
--   link       — агентство даёт свою ссылку на оплату (счёт из «Мой налог»,
--                банка, любого сервиса), КП просто ведёт на неё;
--   requisites — реквизиты и QR по СБП, клиент платит переводом, агентство
--                отмечает получение вручную;
--   yookassa   — у агентства свой магазин ЮKassa, платёж создаётся его ключами;
--   none       — блок оплаты в КП не показывается вовсе.
-- ═══════════════════════════════════════════════════════════════════════

-- 1. Способ оплаты фиксируется В МОМЕНТ отправки КП (как hide_branding):
--    клиентский портал читает аноним, доступа к настройкам агентства у него нет.
--    Уже отправленные ссылки не переписываются задним числом.
alter table public.client_portals
  add column if not exists pay_method  text not null default 'none',
  add column if not exists pay_link    text,
  add column if not exists pay_details text;

-- 2. Ключи ЮKassa агентства.
--    Секрет НЕ должен попадать в браузер, поэтому таблица отдельная и без
--    SELECT-политики: писать может владелец агентства, читать — только
--    service_role из Edge Function.
create table if not exists public.agency_payment_keys (
  agency_id  uuid primary key references public.profiles(id) on delete cascade,
  shop_id    text not null,
  secret_key text not null,
  updated_at timestamptz not null default now()
);

alter table public.agency_payment_keys enable row level security;

drop policy if exists "payment_keys_insert_own" on public.agency_payment_keys;
create policy "payment_keys_insert_own" on public.agency_payment_keys
  for insert to authenticated
  with check (agency_id = (select auth.uid()));

drop policy if exists "payment_keys_update_own" on public.agency_payment_keys;
create policy "payment_keys_update_own" on public.agency_payment_keys
  for update to authenticated
  using (agency_id = (select auth.uid()))
  with check (agency_id = (select auth.uid()));

drop policy if exists "payment_keys_delete_own" on public.agency_payment_keys;
create policy "payment_keys_delete_own" on public.agency_payment_keys
  for delete to authenticated
  using (agency_id = (select auth.uid()));

-- SELECT-политики нет сознательно: секрет не отдаётся обратно даже владельцу.
-- Интерфейсу достаточно знать, подключены ключи или нет:
create or replace function public.has_payment_keys()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.agency_payment_keys
    where agency_id = auth.uid()
  );
$$;

revoke all on function public.has_payment_keys() from public;
grant execute on function public.has_payment_keys() to authenticated;

-- 3. Ручная отметка «аванс получен» — для способов, где деньги идут мимо
--    сервиса (ссылка, реквизиты). Вебхук ЮKassa для таких КП не придёт.
--    Проверяем, что КП принадлежит вызывающему агентству.
create or replace function public.owner_mark_advance_paid(p_portal_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.client_portals
     set advance_paid_at = coalesce(advance_paid_at, now()),
         advance_payment_id = coalesce(advance_payment_id, 'manual')
   where id = p_portal_id
     and agency_id = auth.uid();

  if not found then
    raise exception 'Portal not found or not yours';
  end if;
end;
$$;

revoke all on function public.owner_mark_advance_paid(uuid) from public;
grant execute on function public.owner_mark_advance_paid(uuid) to authenticated;

-- 3b. Портал читает данные КП через get_client_portal (аноним, доступа к
--     настройкам агентства у него нет) — отдаём ему и способ оплаты.
--     Состав RETURNS TABLE меняется, поэтому DROP + CREATE. Остальные 14 колонок
--     как в 20260727000001, без изменений. Секрет ЮKassa сюда НЕ попадает.
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
  pay_details text
)
language sql
security definer
set search_path = public
as $$
  select
    deal_name, deal_status, total_price, included_text, excluded_text,
    proposal_note, services_list, approved_at, advance_amount,
    advance_paid_at, advance_payment_id, agency_id, signer_name,
    coalesce(hide_branding, false),
    coalesce(pay_method, 'none'), pay_link, pay_details
  from public.client_portals
  where id = p_portal_id;
$$;
grant execute on function public.get_client_portal(uuid) to anon, authenticated;

-- 4. Снять отметку (ошиблись кнопкой) — той же проверкой прав.
create or replace function public.owner_unmark_advance_paid(p_portal_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.client_portals
     set advance_paid_at = null,
         advance_payment_id = null
   where id = p_portal_id
     and agency_id = auth.uid()
     -- Оплату, подтверждённую платёжной системой, руками не отменяем.
     and coalesce(advance_payment_id, 'manual') = 'manual';

  if not found then
    raise exception 'Portal not found, not yours, or paid online';
  end if;
end;
$$;

revoke all on function public.owner_unmark_advance_paid(uuid) from public;
grant execute on function public.owner_unmark_advance_paid(uuid) to authenticated;
