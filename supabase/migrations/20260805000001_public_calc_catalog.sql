-- ═══════════════════════════════════════════════════════════════════════
-- Публичный калькулятор сметы: цены АГЕНТСТВА, а не встроенные цены ADERVIS.
--
-- Проблема (проверена 2026-08-04, подтверждена 2026-08-05). Страница ?calc=…
-- задумана как лид-магнит: студия ставит её себе на сайт, посетитель считает
-- смету и оставляет заявку. Но в адресе НЕТ идентификатора агентства вовсе,
-- поэтому калькулятор стартует с defaultState() и показывает BASE_ITEMS —
-- встроенный каталог ADERVIS. То есть любая студия, поставившая калькулятор
-- себе на сайт, показывает своим посетителям цены чужой компании, к тому же
-- прямого конкурента по видеопродакшну. Функция сломана ровно в том сценарии,
-- ради которого сделана.
--
-- ── Почему нужна функция, а не обычный SELECT ──────────────────────────
-- Каталог живёт в agency_state.state_json, а он закрыт RLS (только владелец).
-- Посетитель калькулятора анонимен и агентством не является.
--
-- ── Что здесь сделано ради безопасности (читать перед любой правкой) ────
--
-- 1. ОПТ-ИН. Каталог отдаётся ТОЛЬКО если агентство само включило публичный
--    калькулятор (state_json->>'publicCalcEnabled'). По умолчанию выключено,
--    поэтому для всех, кто эту витрину не открывал, ничего не меняется.
--    Без флага любой, кто знает agency_id, читал бы прайс любой студии — а
--    agency_id не секрет, он стоит в ссылках на бриф и в реферальных ссылках.
--
-- 2. БЕЛЫЙ СПИСОК ПОЛЕЙ, а не выдача объектов целиком. Сегодня на позициях
--    каталога нет ничего внутреннего (себестоимость `cost` и `internalComment`
--    живут на СТРОКАХ СМЕТЫ, не на позициях, — проверено), но каталог правится
--    редактором, и завтра в override может лечь что угодно. Перечисление полей
--    поимённо означает, что новое поле не утечёт само собой — его придётся
--    добавить сюда руками и в этот момент подумать.
--
-- 3. НИКАКОГО state_json целиком. В нём лежат сделки, клиенты, финансы и
--    команда. Утечка календарного фида (дважды!) выросла ровно из такой
--    широкой выдачи — см. SECURITY.md.
--
-- Что раскрывается: прайс-лист и состав пакетов. Ровно то, что агентство
-- САМО публикует, включив калькулятор на своём сайте.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.get_public_catalog(p_agency_id text)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select case
    -- Оптин: строго true. NULL, отсутствие ключа, 'false' → каталог не отдаём.
    when coalesce((state_json ->> 'publicCalcEnabled')::boolean, false) is not true
      then null
    else jsonb_build_object(
      -- Имя и логотип — то же, что уже отдаёт get_brief_agency публичной форме брифа.
      'company', jsonb_build_object(
        'name', coalesce(state_json -> 'company' ->> 'name', ''),
        'logo', coalesce(state_json -> 'company' ->> 'logoUrl', '')
      ),

      -- Свои позиции агентства. Поля перечислены поимённо (см. пункт 2 выше).
      'customItems', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id',        it ->> 'id',
          'category',  it ->> 'category',
          'section',   it ->> 'section',
          'name',      it ->> 'name',
          'desc',      it ->> 'desc',
          'calcModel', it ->> 'calcModel',
          'price',     it -> 'price',
          'unit',      it ->> 'unit',
          'stage',     it ->> 'stage',
          'tags',      coalesce(it -> 'tags',  '[]'::jsonb),
          'rates',     coalesce(it -> 'rates', '{}'::jsonb)
        ))
        from jsonb_array_elements(coalesce(state_json -> 'customItems', '[]'::jsonb)) it
      ), '[]'::jsonb),

      -- Переопределения базовых позиций: тот же белый список, лишние ключи
      -- отбрасываются jsonb_strip_nulls, чтобы не подменять поле пустотой.
      'catalogOverrides', coalesce((
        select jsonb_object_agg(e.k, jsonb_strip_nulls(jsonb_build_object(
          'name',      e.v ->> 'name',
          'desc',      e.v ->> 'desc',
          'category',  e.v ->> 'category',
          'section',   e.v ->> 'section',
          'calcModel', e.v ->> 'calcModel',
          'price',     e.v -> 'price',
          'unit',      e.v ->> 'unit',
          'stage',     e.v ->> 'stage',
          'rates',     e.v -> 'rates'
        )))
        from jsonb_each(coalesce(state_json -> 'catalogOverrides', '{}'::jsonb)) as e(k, v)
      ), '{}'::jsonb),

      -- Пакеты услуг: набор идентификаторов позиций плюс описание.
      'packages', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id',      p ->> 'id',
          'name',    p ->> 'name',
          'cat',     p ->> 'cat',
          'tier',    p -> 'tier',
          'desc',    p ->> 'desc',
          'goodFor', p ->> 'goodFor',
          'items',   coalesce(p -> 'items', '[]'::jsonb),
          'notes',   coalesce(p -> 'notes', '[]'::jsonb)
        ))
        from jsonb_array_elements(coalesce(state_json -> 'packages', '[]'::jsonb)) p
      ), '[]'::jsonb),

      -- Простые словари «идентификатор → число/флаг», раскрывать в них нечего.
      'catalogPrices',      coalesce(state_json -> 'catalogPrices',      '{}'::jsonb),
      'hiddenItems',        coalesce(state_json -> 'hiddenItems',        '{}'::jsonb),
      'permanentlyDeleted', coalesce(state_json -> 'permanentlyDeleted', '{}'::jsonb)
    )
  end
  from agency_state
  where id = p_agency_id
$$;

-- Гранты: нужны ОБА revoke, иначе право остаётся через роль public
-- (см. memory: gotcha-revoke-needs-both-public-and-anon).
revoke all on function public.get_public_catalog(text) from public;
revoke all on function public.get_public_catalog(text) from anon;
grant execute on function public.get_public_catalog(text) to anon;
grant execute on function public.get_public_catalog(text) to authenticated;
