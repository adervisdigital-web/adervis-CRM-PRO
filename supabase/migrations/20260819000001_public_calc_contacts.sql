-- ═══════════════════════════════════════════════════════════════════════
-- Публичный калькулятор: контакты СТУДИИ, чтобы заявка не уходила сервису.
--
-- Проблема (найдена 2026-08-19). Экран «Заявка отправлена» показывал зашитые
-- контакты ADERVIS: Telegram @Adervis_digital, телефон +7 (922) 301-88-80, почта
-- adervis.digital@gmail.com. Посетитель ЧУЖОЙ студии считал смету и получал
-- предложение прислать её нам. Владелец сервиса этого не видит — для него
-- контакты верные.
--
-- Это не «чужое имя на документе», это увод лида: ровно так же аванс клиента
-- уходил в магазин владельца сервиса (см. 20260803000001). Деньги и заявки
-- обязаны идти той студии, чей это калькулятор.
--
-- Здесь — только три новых ключа в 'company'. Остальное тело функции скопировано
-- из 20260805000001 без изменений: оптин по publicCalcEnabled и белые списки
-- полей (customItems, catalogOverrides, packages) — то, ради чего эта функция и
-- писалась поимённо, чтобы новое поле не утекло само собой.
--
-- Раскрывается ровно то, что студия и так печатает на своих документах, и только
-- для агентств, которые САМИ включили публичную витрину.
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
        'logo', coalesce(state_json -> 'company' ->> 'logoUrl', ''),
        -- Контакты: посетителю нужно, куда написать, а студии — чтобы заявка
        -- пришла ей, а не сервису. Пустые поля интерфейс не показывает вовсе.
        'phone', coalesce(state_json -> 'company' ->> 'phone', ''),
        'email', coalesce(state_json -> 'company' ->> 'email', ''),
        'site',  coalesce(state_json -> 'company' ->> 'site',  '')
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
grant execute on function public.get_public_catalog(text) to anon, authenticated;

-- ВНИМАНИЕ: пока миграция не накатана, контактов в ответе нет, и app.js это
-- переживает — экран «заявка отправлена» показывает контакты, только если они
-- пришли. Чужих (наших) контактов там больше нет ни при каком раскладе.
