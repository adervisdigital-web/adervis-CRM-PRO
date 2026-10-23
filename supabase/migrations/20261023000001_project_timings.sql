-- Онлайн-тайминг съёмки (владелец 23.10.2026): у проекта — план съёмочного дня
-- блоками (время, длительность, должности, локация, реквизит, заметки), который
-- открывается по ссылке без аккаунта: ссылка-ПРОСМОТР для всей группы и
-- ссылка-РЕДАКТОР для администратора площадки. В день съёмки — живой режим
-- («сейчас идёт», «отстаём на 15 мин» сдвигает всё дальше), у всех по ссылке
-- обновляется само. Только тариф «Про».
--
-- Почему отдельная таблица, а не agency_state: правят ДВЕ стороны — студия в CRM
-- и администратор по ссылке без аккаунта. В общем состоянии студии правка по
-- ссылке перетирала бы её работу (и наоборот), а аноним к agency_state доступа
-- не имеет и не должен. Здесь у каждой записи версия: сохранение с устаревшей
-- версией не перезаписывает, а возвращает свежие данные.
--
-- Доступ: читать/править/удалять — участники агентства (RLS, как brief_submissions;
-- profiles.agency_id — text, поэтому и здесь text). Вставка — ТОЛЬКО через
-- create_project_timing: там сервер сам проверяет тариф «Про», клиенту не верим.
-- Аноним — только через get_project_timing (по id из ссылки) и save_project_timing
-- (по секретному edit_token из ссылки редактора).
--
-- Проверка после наката:
--   supabase db query --linked "select count(*) from public.project_timings;"
--   (под anon прямой select обязан вернуть ноль строк, а get_project_timing — запись)

create table if not exists public.project_timings (
  id          uuid primary key default gen_random_uuid(),
  agency_id   text not null,
  project_id  text,
  edit_token  uuid not null default gen_random_uuid(),
  title       text not null default '',
  shoot_date  date,
  data        jsonb not null default '{}'::jsonb,
  version     integer not null default 1,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists project_timings_agency_idx on public.project_timings (agency_id);
create unique index if not exists project_timings_project_uidx on public.project_timings (agency_id, project_id) where project_id is not null;

alter table public.project_timings enable row level security;

drop policy if exists "timing_agency_select" on public.project_timings;
create policy "timing_agency_select" on public.project_timings for select to authenticated
  using (agency_id = (select auth.uid())::text
         or agency_id in (select p.agency_id from public.profiles p where p.id = (select auth.uid())));
drop policy if exists "timing_agency_delete" on public.project_timings;
create policy "timing_agency_delete" on public.project_timings for delete to authenticated
  using (agency_id = (select auth.uid())::text
         or agency_id in (select p.agency_id from public.profiles p where p.id = (select auth.uid())));
-- insert/update политик нет намеренно: только через функции ниже

-- Агентство вошедшего: своё (владелец) или то, куда приглашён.
create or replace function public._my_agency_text()
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select nullif(agency_id, '') from public.profiles where id = auth.uid()), auth.uid()::text);
$$;
revoke all on function public._my_agency_text() from public;
revoke all on function public._my_agency_text() from anon;
grant execute on function public._my_agency_text() to authenticated;

-- Создать (или вернуть уже созданный) тайминг проекта. Тариф «Про» проверяет база:
-- план владельца агентства 'pro1'/'pro3'/'pro6'/'pro12' (НЕ like 'pro%' — старый
-- план 'pro' продавался как «Стандарт», см. agency_seat_info), подписка жива.
create or replace function public.create_project_timing(p_project_id text, p_title text, p_date date, p_data jsonb)
returns json language plpgsql security definer set search_path = public as $$
declare
  ag text; o_status text; o_exp timestamptz; o_plan text; r public.project_timings;
begin
  if auth.uid() is null then raise exception 'Access denied'; end if;
  ag := public._my_agency_text();
  select subscription_status, subscription_expires_at, subscription_plan into o_status, o_exp, o_plan
    from public.profiles where id::text = ag;
  if not (coalesce(public._is_super_admin(), false)
          or (o_status = 'active' and (o_exp is null or o_exp > now()) and coalesce(o_plan, '') like 'pro_%')) then
    raise exception 'timing_requires_pro';
  end if;
  if octet_length(coalesce(p_data, '{}'::jsonb)::text) > 200000 then raise exception 'timing_too_large'; end if;
  select * into r from public.project_timings where agency_id = ag and project_id = p_project_id;
  if not found then
    insert into public.project_timings (agency_id, project_id, title, shoot_date, data)
      values (ag, p_project_id, left(coalesce(p_title, ''), 200), p_date, coalesce(p_data, '{}'::jsonb))
      returning * into r;
  end if;
  return json_build_object('id', r.id, 'edit_token', r.edit_token, 'title', r.title, 'shoot_date', r.shoot_date,
    'data', r.data, 'version', r.version, 'updated_at', r.updated_at);
end;
$$;
revoke all on function public.create_project_timing(text, text, date, jsonb) from public;
revoke all on function public.create_project_timing(text, text, date, jsonb) from anon;
grant execute on function public.create_project_timing(text, text, date, jsonb) to authenticated;

-- Прочитать по ссылке. edit_token НЕ отдаётся никогда; can_edit — верный ли ключ
-- редактора пришёл (или читает участник агентства). Имя и логотип студии — для шапки.
create or replace function public.get_project_timing(p_id uuid, p_token uuid default null)
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'id', t.id, 'title', t.title, 'shoot_date', t.shoot_date, 'data', t.data,
    'version', t.version, 'updated_at', t.updated_at,
    'can_edit', (p_token is not null and p_token = t.edit_token)
                or (auth.uid() is not null and t.agency_id = public._my_agency_text()),
    'agency_name', coalesce(a.state_json -> 'company' ->> 'name', ''),
    'agency_logo', coalesce(a.state_json -> 'company' ->> 'logoUrl', ''))
  from public.project_timings t
  left join public.agency_state a on a.id = t.agency_id
  where t.id = p_id;
$$;
grant execute on function public.get_project_timing(uuid, uuid) to anon, authenticated;

-- Сохранить: по ключу редактора или участником агентства. p_version — версия, с
-- которой начинали править: если запись успели изменить, НЕ перезаписываем, а
-- отдаём свежие данные (conflict) — клиент покажет их и предложит повторить.
create or replace function public.save_project_timing(p_id uuid, p_token uuid, p_version integer, p_title text, p_date date, p_data jsonb)
returns json language plpgsql security definer set search_path = public as $$
declare r public.project_timings; allowed boolean;
begin
  select * into r from public.project_timings where id = p_id for update;
  if not found then raise exception 'timing_not_found'; end if;
  allowed := (p_token is not null and p_token = r.edit_token)
             or (auth.uid() is not null and r.agency_id = public._my_agency_text());
  if not allowed then raise exception 'Access denied'; end if;
  if octet_length(coalesce(p_data, '{}'::jsonb)::text) > 200000 then raise exception 'timing_too_large'; end if;
  if p_version is distinct from r.version then
    return json_build_object('ok', false, 'conflict', true, 'version', r.version, 'title', r.title,
      'shoot_date', r.shoot_date, 'data', r.data, 'updated_at', r.updated_at);
  end if;
  update public.project_timings
     set title = left(coalesce(p_title, title), 200), shoot_date = p_date, data = coalesce(p_data, data),
         version = version + 1, updated_at = now()
   where id = p_id
   returning * into r;
  return json_build_object('ok', true, 'version', r.version, 'updated_at', r.updated_at);
end;
$$;
grant execute on function public.save_project_timing(uuid, uuid, integer, text, date, jsonb) to anon, authenticated;
