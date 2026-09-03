-- ═══════════════════════════════════════════════════════════════════════
-- Воронка активации: уметь считать ТОЛЬКО внешних.
--
-- Зачем. Первый же прогон 03.09.2026 дал «16 регистраций, 3 отправленных КП,
-- 0 оплат», и я прочитал это как обрыв на шаге «КП → деньги». Владелец поправил:
-- «не оплатил, потому что это был тест». Все 16 аккаунтов — его собственные,
-- то есть отчёт измерял не рынок, а самого владельца, и любой вывод из него был
-- бы выводом о себе.
--
-- Признак «не рынок» в базе уже есть: admin_tag (миграция 20260829000001) —
-- «Свой аккаунт», «Тест», «Амбассадор». Второго признака заводить нельзя: два
-- определения «кто тут настоящий» разъедутся молча, как это уже было с ценой.
--
-- Параметром, а не отдельной функцией: вопрос один и тот же, отличается только
-- выборка. Две почти одинаковые функции пришлось бы править парой.
-- ═══════════════════════════════════════════════════════════════════════

drop function if exists public.admin_get_activation();

create or replace function public.admin_get_activation(p_only_untagged boolean default false)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare result json;
begin
  if not _is_super_admin() then
    raise exception 'Access denied';
  end if;

  select json_agg(row_to_json(r))
  into result
  from (
    select
      coalesce(p.signup_source, '')                      as source,
      count(*)                                           as regs,
      count(*) filter (where a.deals > 0)                as with_deal,
      count(*) filter (where a.billed > 0)               as with_estimate,
      count(*) filter (where a.portals > 0)              as with_portal,
      count(*) filter (where pay.user_id is not null)    as paid
    from public.profiles p
    /* Состояние агентства читаем ОДИН раз на аккаунт и сразу сворачиваем в три
       числа: тянуть state_json целиком (у владельца это мегабайты) ради проверки
       «есть ли хоть одна сделка» значило бы гонять всю базу по сети. */
    left join lateral (
      select
        jsonb_array_length(coalesce(st.state_json->'savedProjects', '[]'::jsonb)) as deals,
        (select coalesce(sum(coalesce((d->>'total')::numeric, 0)), 0)
           from jsonb_array_elements(coalesce(st.state_json->'savedProjects', '[]'::jsonb)) d) as billed,
        (select count(*) from client_portals cp where cp.agency_id::text = p.agency_id::text) as portals
      from agency_state st
      where st.id::text = p.agency_id::text
    ) a on true
    left join lateral (
      select pm.user_id from payments pm where pm.user_id = p.id limit 1
    ) pay on true
    -- Помеченные аккаунты (свои, тестовые, амбассадоры) — не рынок.
    where not p_only_untagged or p.admin_tag is null or btrim(p.admin_tag) = ''
    group by coalesce(p.signup_source, '')
    order by count(*) filter (where pay.user_id is not null) desc, count(*) desc
  ) r;

  return coalesce(result, '[]'::json);
end;
$function$;

-- Нужны ОБА revoke: `from public` не снимает право, выданное anon отдельно.
revoke all on function public.admin_get_activation(boolean) from public;
revoke all on function public.admin_get_activation(boolean) from anon;
grant execute on function public.admin_get_activation(boolean) to authenticated;
