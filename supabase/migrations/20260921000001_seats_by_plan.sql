-- Места в команде по ТАРИФУ, а не по факту любой оплаты.
--
-- С 21.09.2026 у продукта три тарифа: «Старт» (один пользователь), «Стандарт»
-- (до трёх) и «Про» (до десяти). Раньше agency_seat_info считала места так:
-- есть живая оплата — даёт p_max_paid мест, где p_max_paid присылает КЛИЕНТ.
-- То есть на «Старте» второй человек присоединился бы штатно, а подделать
-- число мест мог кто угодно, кто умеет звать RPC.
--
-- Теперь предел считает база по плану владельца: start* = 1, pro* = 10,
-- остальные оплаченные = 3. Клиентское значение больше ни на что не влияет
-- (параметр оставлен ради совместимости с уже выложенным app.js).
--
-- Проверка после наката:
--   supabase db query --linked "select public.agency_seat_info('<agency_id>'::uuid, 3);"

create or replace function public.agency_seat_info(p_agency_id uuid, p_max_paid int default 3)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_status text;
  owner_exp    timestamptz;
  owner_plan   text;
  used         int;
  paid         boolean;
  limit_seats  int;
begin
  -- Звать может только вошедший: без этого код приглашения (= agency_id)
  -- превращается в пробник «существует ли такое агентство».
  if auth.uid() is null then
    raise exception 'Access denied';
  end if;

  select subscription_status, subscription_expires_at, subscription_plan
    into owner_status, owner_exp, owner_plan
    from profiles where id = p_agency_id;

  -- Владельца нет — агентства с таким кодом не существует. Отдаём отдельный
  -- ответ, а не нули: «кода нет» и «мест нет» лечатся по-разному.
  if owner_status is null then
    return json_build_object('exists', false, 'max', 1, 'used', 0, 'paid', false);
  end if;

  paid := owner_status = 'active' and (owner_exp is null or owner_exp > now());

  select count(*) into used from profiles where agency_id = p_agency_id;

  -- Потолок мест задаёт тариф, а не клиент.
  if not paid then
    limit_seats := 1;
  elsif coalesce(owner_plan, '') like 'start%' then
    limit_seats := 1;
  elsif coalesce(owner_plan, '') like 'pro%' then
    limit_seats := 10;
  else
    limit_seats := 3;
  end if;

  return json_build_object(
    'exists', true,
    'max',    limit_seats,
    'used',   used,
    'paid',   paid
  );
end;
$$;

-- Нужны ОБА revoke: `from public` не снимает право, выданное роли anon отдельно.
revoke all on function public.agency_seat_info(uuid, int) from public;
revoke all on function public.agency_seat_info(uuid, int) from anon;
grant execute on function public.agency_seat_info(uuid, int) to authenticated;
