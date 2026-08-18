-- ═══════════════════════════════════════════════════════════════════════
-- Клиентское КП должно называть АГЕНТСТВО, а не сервис.
--
-- Проблема (найдена 2026-08-18). Страница ?portal=<uuid> — единственный артефакт
-- продукта, который попадает наружу: её открывает заказчик студии. В шапке стояли
-- зашитые logo-icon.svg и «Adervis», в подвале — «Adervis · Digital Creative Agency»
-- и почта adervis.digital@gmail.com. Для владельца сервиса всё выглядело верно, он и
-- есть ADERVIS. Для любой другой студии это значило, что её заказчик получает КП,
-- подписанное чужой компанией (прямым конкурентом по видеопродакшну), и отвечает на
-- письмо не студии, а сервису.
--
-- Ровно этот дефект уже чинили дважды: в онлайн-брифе (20260803000005,
-- get_brief_agency) и в публичном калькуляторе (20260805000001, get_public_catalog).
-- Оба раза в комментарии написано «портал КП этот случай решает правильно» — это
-- было неверно, там его никто не проверял. Третий случай одной причины.
--
-- ── Почему поля добавляются сюда, а не отдельной функцией ───────────────
-- Портал уже читает свои данные одним анонимным вызовом get_client_portal, и
-- agency_id у строки КП есть. Отдельная публичная функция «отдай контакты по
-- agency_id» раскрывала бы почту и телефон студии любому, кто знает agency_id
-- (а он не секрет: стоит в ссылках на бриф и в реферальных). Здесь же ключ
-- доступа — UUID самого КП, то есть ссылка, которую студия разослала сама.
--
-- ── Что раскрывается ───────────────────────────────────────────────────
-- Имя, логотип, описание и контакты — ровно то, что агентство уже печатает в
-- своём КП и договоре (_docBrandHtml / _docRequisitesHtml в app.js). Ни сделок,
-- ни сумм, ни команды: перечисление полей поимённо означает, что новое поле в
-- company не утечёт само собой.
--
-- ── Живое значение, а не снимок ────────────────────────────────────────
-- hide_branding и pay_method фиксируются НА МОМЕНТ отправки: это условия сделки,
-- их нельзя переписывать задним числом. Имя и контакты — наоборот: студия сменила
-- почту, и все уже разосланные КП должны отвечать новой. Поэтому join, а не копия
-- в client_portals.
--
-- Состав RETURNS TABLE меняется → DROP + CREATE. Первые 17 колонок — как в
-- 20260803000001, без изменений.
-- ═══════════════════════════════════════════════════════════════════════

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

-- ВНИМАНИЕ: пока миграция не накатана, шести полей в ответе нет, и app.js это
-- переживает — шапка показывает «Коммерческое предложение» без имени и логотипа,
-- подвал остаётся без контактов. Это сознательный выбор, тот же, что в брифе:
-- лучше без имени, чем с чужим.
