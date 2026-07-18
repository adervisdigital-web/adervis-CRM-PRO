-- Онлайн-брифы: публичное чтение кастом-шаблона вопросов.
--
-- Шаблоны вопросов брифа хранятся в agency_state.state_json -> 'briefTemplates' -> <typeId>
-- (редактируются владельцем через обычный синк состояния). Публичная форма брифа
-- (?brief=<agency>&type=<type>) открывается анонимно и НЕ имеет доступа к agency_state
-- (RLS — только владелец). Поэтому даём одну узкую SECURITY DEFINER-функцию, которая
-- возвращает ТОЛЬКО шаблон нужного типа (не раскрывая остальной state).
--
-- Без этой функции публичная форма просто показывает встроенный дефолтный набор
-- вопросов типа (в app.js), так что фича не ломается — RPC лишь «доставляет» кастом-правки.

create or replace function public.get_brief_template(p_agency_id text, p_type text)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select state_json -> 'briefTemplates' -> p_type
  from agency_state
  where id = p_agency_id
$$;

-- Публичная форма работает под анонимным ключом → нужен доступ anon (и authenticated).
grant execute on function public.get_brief_template(text, text) to anon, authenticated;

-- Ничего, кроме одного jsonb-объекта шаблона, функция не отдаёт; параметр p_type
-- жёстко индексирует нужный ключ, обхода к соседним ключам state_json нет.
