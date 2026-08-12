-- ═══════════════════════════════════════════════════════════════════════
-- Места в команде: проверка лимита при входе по коду приглашения.
--
-- Зачем. Тарифы обещают «до 3 пользователей» (PAID_MAX_USERS в app.js), и в
-- клиенте эта проверка была написана: перед созданием профиля _loadUserProfile
-- читал профиль владельца агентства (оплачено ли) и считал, сколько человек уже
-- в агентстве. Обе строки — чужие, а единственная SELECT-политика на profiles
-- на проде это `profiles: read own` (auth.uid() = id). То есть новый человек не
-- видел ни владельца, ни коллег: ownerProfile всегда null, count всегда 0.
-- Условие `(memberCount || 0) >= maxUsers` не срабатывало никогда, серверной
-- проверки нет ни в одной Edge Function — лимит не ограничивал ничего.
--
-- Почему функция, а не запрос из клиента. Ослаблять RLS ради счётчика нельзя:
-- чтобы клиент увидел коллег, пришлось бы отдать ему чужие строки profiles
-- (email, статус подписки, срок оплаты). Поэтому SECURITY DEFINER, и наружу
-- уходят ТОЛЬКО ДВА ЧИСЛА и один флаг: сколько мест, сколько занято, платное ли
-- агентство. Ни email, ни id, ни имён.
--
-- Кто может звать: любой вошедший (authenticated) — на момент вызова человек
-- уже прошёл авторизацию, но профиля у него ещё нет. anon отрезан: код
-- приглашения = agency_id, и без этого любой мог бы перебором проверять, какие
-- агентства существуют и платят.
--
-- p_max_paid приходит из клиента сознательно: число мест — продуктовое решение
-- (PAID_MAX_USERS), оно живёт в app.js рядом с витриной тарифов, и держать его
-- второй копией в базе значит завести ещё одну пару, которая разъедется молча.
-- База отвечает на вопрос «оплачено ли и сколько уже вошло», решение принимает
-- клиент.
--
-- Проверка после наката (401 = права сняты, значит защита на месте):
--   curl -s -o /dev/null -w "%{http_code}\n" -X POST \
--     "https://qzeylogyledmhjpzvgkk.supabase.co/rest/v1/rpc/agency_seat_info" \
--     -H "apikey: <publishable-ключ>" -H "Content-Type: application/json" \
--     -d '{"p_agency_id":"00000000-0000-0000-0000-000000000000"}'
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.agency_seat_info(p_agency_id uuid, p_max_paid int default 3)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_status text;
  owner_exp    timestamptz;
  used         int;
  paid         boolean;
begin
  -- Звать может только вошедший: без этого код приглашения (= agency_id)
  -- превращается в пробник «существует ли такое агентство».
  if auth.uid() is null then
    raise exception 'Access denied';
  end if;

  select subscription_status, subscription_expires_at
    into owner_status, owner_exp
    from profiles where id = p_agency_id;

  -- Владельца нет — агентства с таким кодом не существует. Отдаём отдельный
  -- ответ, а не нули: «кода нет» и «мест нет» лечатся по-разному.
  if owner_status is null then
    return json_build_object('exists', false, 'max', 1, 'used', 0, 'paid', false);
  end if;

  -- Та же логика, что в maxUsersForProfile(): места даёт факт оплаты, а не
  -- длина купленного периода, и истёкшая оплата мест не даёт.
  paid := owner_status = 'active' and (owner_exp is null or owner_exp > now());

  select count(*) into used from profiles where agency_id = p_agency_id;

  return json_build_object(
    'exists', true,
    'max',    case when paid then greatest(p_max_paid, 1) else 1 end,
    'used',   used,
    'paid',   paid
  );
end;
$$;

-- Нужны ОБА revoke: `from public` не снимает право, выданное роли anon отдельно
-- (см. gotcha-revoke-needs-both-public-and-anon).
revoke all on function public.agency_seat_info(uuid, int) from public;
revoke all on function public.agency_seat_info(uuid, int) from anon;
grant execute on function public.agency_seat_info(uuid, int) to authenticated;
