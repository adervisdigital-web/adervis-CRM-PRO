-- ═══════════════════════════════════════════════════════════════════════
-- calendar-feed: отдельный отзываемый токен вместо agency_id
--
-- Проблема (утечка между клиентами, найдена 2026-07-30):
--   1. get_client_portal отдаёт колонку agency_id АНОНИМУ (grant to anon);
--   2. страница КП рендерит его прямо в HTML — ссылка «Сделано в ADERVIS»
--      имеет вид https://app.adervis.ru/?ref=<agency_id>;
--   3. calendar-feed принимал ?token=<agency_id> и в этом режиме отдавал
--      ВЕСЬ агентский фид: названия всех сделок, статусы, все задачи с
--      заголовками, ответственными, приоритетами и заметками.
--   Итог: любой заказчик, получивший ссылку на своё КП, читал внутреннюю
--   кухню по всем остальным сделкам агентства. Единственной «проверкой»
--   был регэксп формата UUID.
--
--   Это рецидив бага, который чинили 26.07 (тогда закрыли режим ?portal=,
--   а режим ?token= остался, и agency_id к тому же стал публичным).
--
-- Решение: разделить ИДЕНТИФИКАТОР и СЕКРЕТ.
--   agency_id остаётся публичным — он реферальный код, его видно в ссылке
--   на КП, и это нормально. Фид переезжает на profiles.calendar_token,
--   который никогда не покидает личный кабинет и может быть отозван.
--
-- ВНИМАНИЕ при накате: старые ссылки на фид перестают работать сразу —
-- это и есть цель (они утекли). Владельцу и команде нужно переподписаться
-- на календарь новой ссылкой из Настроек → Интеграции.
-- ═══════════════════════════════════════════════════════════════════════

-- 1. Колонка + бэкфилл существующих профилей
alter table profiles add column if not exists calendar_token uuid;
update profiles set calendar_token = gen_random_uuid() where calendar_token is null;
alter table profiles alter column calendar_token set default gen_random_uuid();

-- Уникальность: без неё два профиля теоретически могли бы делить токен,
-- и lookup в calendar-feed стал бы неоднозначным.
create unique index if not exists profiles_calendar_token_key on profiles (calendar_token);

-- 2. Защита от подмены токена.
--    Политика profiles_update_own разрешает пользователю менять ЛЮБЫЕ колонки
--    своего профиля. Без пина ниже он мог бы выставить себе calendar_token
--    чужого агентства и читать его фид — то есть та же утечка, только с
--    авторизацией. Пиним колонку так же, как поля подписки: клиентский UPDATE
--    её не меняет, ротация идёт через SECURITY DEFINER RPC.
create or replace function protect_subscription_fields()
returns trigger
language plpgsql
security definer
as $$
begin
  -- service_role, postgres, supabase_admin — разрешаем всё
  -- (ЮKassa webhook, subscription-reminder, ручные правки в Dashboard,
  --  и сама rotate_calendar_token как SECURITY DEFINER)
  if current_user in ('service_role', 'postgres', 'supabase_admin') then
    return new;
  end if;

  -- Клиентский запрос: молча восстанавливаем защищённые поля
  new.subscription_status     := old.subscription_status;
  new.subscription_plan       := old.subscription_plan;
  new.subscription_expires_at := old.subscription_expires_at;

  -- Токен iCal-фида — только через rotate_calendar_token()
  new.calendar_token := old.calendar_token;

  -- referred_by_agency_id — write-once: нельзя изменить после установки
  if old.referred_by_agency_id is not null then
    new.referred_by_agency_id := old.referred_by_agency_id;
  end if;

  return new;
end;
$$;

-- 3. Ротация — единственный способ сменить токен.
--    Нужна не только на случай компрометации: это ещё и «отозвать доступ у
--    уволившегося», для чего раньше не было вообще никакого механизма —
--    agency_id сменить нельзя, он первичный ключ агентства.
create or replace function rotate_calendar_token()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  update profiles
     set calendar_token = gen_random_uuid()
   where id = auth.uid()
  returning calendar_token into v_token;
  return v_token;
end;
$$;

revoke execute on function rotate_calendar_token() from anon;
grant execute on function rotate_calendar_token() to authenticated;
