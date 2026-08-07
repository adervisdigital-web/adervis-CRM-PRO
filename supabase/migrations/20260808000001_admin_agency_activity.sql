-- ═══════════════════════════════════════════════════════════════════════
-- Админка: активность аккаунта (кто и как пользуется продуктом).
--
-- Зачем. До 07.08.2026 внешних пользователей не было ни одного, и админка
-- отвечала только на вопрос «кто зарегистрировался и до какого числа оплачено».
-- С первым живым пользователем нужен другой вопрос — ЧТО он внутри делает:
-- завёл ли сделки, посчитал ли смету, отправил ли КП клиенту. Без этого
-- «пользуется» и «зашёл один раз» выглядят одинаково.
--
-- Почему функция, а не запрос из клиента. Состояние агентства лежит в
-- agency_state.state_json под RLS: читать чужую строку нельзя (и правильно —
-- там сделки и контакты клиентов). Поэтому SECURITY DEFINER + проверка
-- _is_super_admin(), и наружу отдаются ТОЛЬКО ЧИСЛА. Ни одного названия
-- сделки, имени клиента или телефона в ответе нет и не должно появиться:
-- админ смотрит за использованием продукта, а не читает чужую переписку.
--
-- Проверка после наката (401/403 = право снято, ошибка «Access denied» = защита
-- на месте даже для вошедшего не-админа):
--   curl -s -o /dev/null -w "%{http_code}\n" -X POST \
--     "https://qzeylogyledmhjpzvgkk.supabase.co/rest/v1/rpc/admin_get_agency_activity" \
--     -H "apikey: <publishable-ключ>" -H "Content-Type: application/json" \
--     -d '{"p_agency_id":"00000000-0000-0000-0000-000000000000"}'
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.admin_get_agency_activity(p_agency_id uuid)
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
    from agency_state where id = p_agency_id;

  -- Аккаунт есть, а состояния нет — человек зарегистрировался и не начал работу.
  -- Это отдельный ответ, а не нули: «ничего не сохранил» и «сохранил пустое» —
  -- разные истории, и путать их нельзя.
  if st is null then
    return json_build_object('exists', false, 'portals', (
      select count(*) from client_portals cp where cp.agency_id = p_agency_id
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
    'portals',          (select count(*) from client_portals cp where cp.agency_id = p_agency_id),
    'portals_approved', (select count(*) from client_portals cp
                          where cp.agency_id = p_agency_id and cp.approved_at is not null),
    'portals_paid',     (select count(*) from client_portals cp
                          where cp.agency_id = p_agency_id and cp.advance_paid_at is not null)
  ) into res;

  return res;
end;
$$;

-- Право на EXECUTE приходит с двух сторон (PUBLIC от PostgreSQL и default
-- privileges от Supabase), поэтому нужны ОБА revoke — см. 20260803000004.
revoke execute on function public.admin_get_agency_activity(uuid) from public;
revoke execute on function public.admin_get_agency_activity(uuid) from anon;
grant  execute on function public.admin_get_agency_activity(uuid) to authenticated;
