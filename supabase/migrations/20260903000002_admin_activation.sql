-- ═══════════════════════════════════════════════════════════════════════
-- Активация по каналам: не «сколько пришло», а «сколько осталось».
--
-- Зачем. С 20260903000001 видно, из какого канала человек пришёл и оплатил ли.
-- Между этими двумя событиями — вся жизнь продукта: завёл сделку, посчитал
-- смету, отправил КП клиенту. Канал, из которого приходят и сразу уходят, и
-- канал, из которого доходят до КП, в отчёте «регистрации / оплаты» выглядят
-- ОДИНАКОВО, пока платящих ноль. А платящих ноль — это и есть текущее
-- состояние, то есть отчёт сейчас не различает ничего.
--
-- Шаги выбраны те же, что уже считаются целями в Метрике (app.js, trackGoal):
-- сделка → смета → КП. Третьего набора определений «что такое активация» в
-- продукте быть не должно.
--
-- ── Почему одна функция, а не вызов admin_get_agency_activity в цикле ──
-- Та функция отвечает про ОДНО агентство и возвращает два десятка полей — она
-- для карточки пользователя. Здесь нужен один проход по всем: на 17 аккаунтах
-- разница незаметна, на тысяче цикл из клиента — это тысяча запросов.
--
-- ── Приватность ────────────────────────────────────────────────────────
-- Наружу уходят ТОЛЬКО агрегаты по каналу: ни email, ни id, ни названий сделок.
-- Проверка супер-админа — первой строкой, как во всех admin_-функциях.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.admin_get_activation()
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
    -- Платил ли хоть раз: платежи — единственный честный признак покупки.
    left join lateral (
      select pm.user_id from payments pm where pm.user_id = p.id limit 1
    ) pay on true
    group by coalesce(p.signup_source, '')
    order by count(*) filter (where pay.user_id is not null) desc, count(*) desc
  ) r;

  return coalesce(result, '[]'::json);
end;
$function$;

-- Нужны ОБА revoke: `from public` не снимает право, выданное anon отдельно.
revoke all on function public.admin_get_activation() from public;
revoke all on function public.admin_get_activation() from anon;
grant execute on function public.admin_get_activation() to authenticated;
