-- ═══════════════════════════════════════════════════════════════════════
-- Починка admin_get_agency_activity: «operator does not exist: text = uuid».
--
-- Функция принимала p_agency_id uuid и сравнивала его с agency_state.id, а эта
-- колонка в проекте — ТЕКСТ (agency_id вообще живёт строкой: см. text-параметры
-- в get_brief_agency и telegram_notify_rate_limit). PostgreSQL не сравнивает text
-- с uuid молча — он отказывается, и панель активности в админке падала на первом
-- же клике: «Не вышло: operator does not exist: text = uuid».
--
-- Почему сравнение теперь через ::text, а не «просто поменять тип параметра»:
-- таблицы разные и типы у них РАЗНЫЕ (client_portals.agency_id заведён uuid).
-- Приведение обеих сторон к тексту работает при любом сочетании и переживёт
-- миграцию типов в любую сторону; на объёмах в десятки строк цена приведения
-- (потеря индекса) неощутима, а вот повторно ловить эту ошибку — дорого.
--
-- Старую перегрузку (uuid) обязательно удаляем: иначе в базе окажутся две
-- функции с одним именем, и PostgREST не сможет выбрать между ними.
--
-- Проверка после наката (401 = право снято, функция существует):
--   curl -s -o /dev/null -w "%{http_code}\n" -X POST \
--     "https://qzeylogyledmhjpzvgkk.supabase.co/rest/v1/rpc/admin_get_agency_activity" \
--     -H "apikey: <publishable-ключ>" -H "Content-Type: application/json" \
--     -d '{"p_agency_id":"00000000-0000-0000-0000-000000000000"}'
-- ═══════════════════════════════════════════════════════════════════════

drop function if exists public.admin_get_agency_activity(uuid);

create or replace function public.admin_get_agency_activity(p_agency_id text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  st    jsonb;
  upd   timestamptz;
  deals jsonb;
  res   json;
begin
  if not _is_super_admin() then
    raise exception 'Access denied';
  end if;

  select state_json, updated_at into st, upd
    from agency_state where id::text = p_agency_id;

  -- Аккаунт есть, а состояния нет — человек зарегистрировался и не начал работу.
  -- Это отдельный ответ, а не нули: «ничего не сохранил» и «сохранил пустое» —
  -- разные истории, и путать их нельзя.
  if st is null then
    return json_build_object('exists', false, 'portals', (
      select count(*) from client_portals cp where cp.agency_id::text = p_agency_id
    ));
  end if;

  deals := coalesce(st->'savedProjects', '[]'::jsonb);

  select json_build_object(
    'exists',      true,
    'updated_at',  upd,
    -- Размер состояния: он же потолок синхронизации (realtime рвётся на 256 КБ),
    -- поэтому число полезно видеть до того, как у человека начнут теряться правки.
    'state_kb',    round((octet_length(st::text) / 1024.0)::numeric, 1),

    'deals_total',  jsonb_array_length(deals),
    'deals_active', (select count(*) from jsonb_array_elements(deals) d
                      where coalesce(d->>'crmStatus', 'Лид') not in ('Завершённые', 'Архив')),
    'deals_done',   (select count(*) from jsonb_array_elements(deals) d
                      where coalesce(d->>'crmStatus', '') = 'Завершённые'),
    -- Сделка со сметой = та, где есть сумма: смета и КП — то, ради чего продукт.
    'deals_with_sum', (select count(*) from jsonb_array_elements(deals) d
                        where coalesce((d->>'total')::numeric, 0) > 0),
    'billed',       (select coalesce(sum(coalesce((d->>'total')::numeric, 0)), 0)
                      from jsonb_array_elements(deals) d),
    'paid',         (select coalesce(sum(coalesce((d->>'paid')::numeric, 0)), 0)
                      from jsonb_array_elements(deals) d),
    'last_deal_at', (select max(d->>'updatedAt') from jsonb_array_elements(deals) d),

    'clients',      jsonb_array_length(coalesce(st->'clients', '[]'::jsonb)),
    'team',         jsonb_array_length(coalesce(st->'team', '[]'::jsonb)),
    'own_items',    jsonb_array_length(coalesce(st->'customItems', '[]'::jsonb)),
    'packages',     jsonb_array_length(coalesce(st->'packages', '[]'::jsonb)),

    -- КП живут отдельной таблицей: по ним видно, дошло ли дело до клиента.
    'portals',          (select count(*) from client_portals cp
                          where cp.agency_id::text = p_agency_id),
    'portals_approved', (select count(*) from client_portals cp
                          where cp.agency_id::text = p_agency_id and cp.approved_at is not null),
    'portals_paid',     (select count(*) from client_portals cp
                          where cp.agency_id::text = p_agency_id and cp.advance_paid_at is not null)
  ) into res;

  return res;
end;
$$;

-- Право на EXECUTE приходит с двух сторон (PUBLIC от PostgreSQL и default
-- privileges от Supabase), поэтому нужны ОБА revoke — см. 20260803000004.
revoke execute on function public.admin_get_agency_activity(text) from public;
revoke execute on function public.admin_get_agency_activity(text) from anon;
grant  execute on function public.admin_get_agency_activity(text) to authenticated;
