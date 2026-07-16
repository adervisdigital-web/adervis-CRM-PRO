-- Электронная подпись КП: фиксировать ФИО подписанта.
-- Клиентский портал показывал поле «Ваше ФИО (для подтверждения)» и кнопку
-- «Подписать», app.js собирал signerName — но колонки signer_name не было, а
-- approve_client_portal принимал только p_portal_id. Подпись сохранялась лишь
-- в памяти браузера клиента и терялась при перезагрузке: агентство никогда не
-- видело, кто подписал. Определения ниже воспроизводят фактическую прод-схему
-- (get_client_portal возвращает 12 колонок, total_price integer) + signer_name.

alter table client_portals add column if not exists signer_name text;

-- approve: принять и сохранить ФИО. Пустое значение не затирает уже сохранённое.
-- Добавление параметра = новая сигнатура, старую (uuid) убираем, чтобы не осталась
-- версия без записи подписанта.
drop function if exists approve_client_portal(uuid);
create or replace function approve_client_portal(p_portal_id uuid, p_signer_name text default null)
returns void
language sql
security definer
set search_path = public
as $$
  update client_portals
  set deal_status = 'Согласовано',
      approved_at = now(),
      signer_name = coalesce(nullif(trim(p_signer_name), ''), signer_name)
  where id = p_portal_id;
$$;
grant execute on function approve_client_portal(uuid, text) to anon, authenticated;

-- get: вернуть signer_name (показать «Подписал: ФИО» клиенту и агентству).
-- Изменение состава RETURNS TABLE требует DROP + CREATE (CREATE OR REPLACE не
-- меняет тип возврата). Остальные 12 колонок — как на проде, без изменений.
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
  signer_name text
)
language sql
security definer
set search_path = public
as $$
  select
    deal_name, deal_status, total_price, included_text, excluded_text,
    proposal_note, services_list, approved_at, advance_amount,
    advance_paid_at, advance_payment_id, agency_id, signer_name
  from client_portals
  where id = p_portal_id;
$$;
grant execute on function get_client_portal(uuid) to anon, authenticated;
