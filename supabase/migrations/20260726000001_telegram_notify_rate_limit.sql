-- telegram-notify (Edge Function) принимает произвольный chatId+text от ЛЮБОГО
-- аутентифицированного пользователя (нужно для кнопки «Тест» — проверка ещё не
-- сохранённого chatId до подтверждения владения). Раньше не было лимита частоты
-- вовсе — бесплатный триал-аккаунт мог использовать бота как открытый релей
-- спама на произвольные Telegram chat_id. agency_notify_throttled (простой
-- gate "раз в N секунд") не подходит: sendTelegramNotification() легитимно
-- шлёт НЕСКОЛЬКО сообщений подряд (по одному на каждого получателя в Настройках),
-- простой gate заблокировал бы всех, кроме первого получателя в той же пачке.
-- Нужен счётчик с окном (N сообщений за период), не gate на один вызов.

create table if not exists public.telegram_notify_counters (
  agency_id text primary key,
  window_start timestamptz not null default now(),
  count int not null default 0
);

alter table public.telegram_notify_counters enable row level security;
-- Политик нет намеренно — доступ только через SECURITY DEFINER функцию ниже,
-- прямой доступ к таблице (даже чтение) через REST не нужен никому.

create or replace function public.telegram_notify_rate_limit(
  p_window_ms bigint default 60000,
  p_max_count int default 30
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agency_id text;
  v_count int;
  v_window_start timestamptz;
begin
  select agency_id into v_agency_id from profiles where id = auth.uid();
  if v_agency_id is null then
    return false;
  end if;

  select count, window_start into v_count, v_window_start
  from telegram_notify_counters
  where agency_id = v_agency_id
  for update;

  if not found then
    insert into telegram_notify_counters (agency_id, window_start, count)
    values (v_agency_id, now(), 1);
    return true;
  end if;

  if now() - v_window_start > make_interval(secs => p_window_ms / 1000.0) then
    update telegram_notify_counters set window_start = now(), count = 1
    where agency_id = v_agency_id;
    return true;
  end if;

  if v_count >= p_max_count then
    return false;
  end if;

  update telegram_notify_counters set count = count + 1 where agency_id = v_agency_id;
  return true;
end;
$$;

grant execute on function public.telegram_notify_rate_limit(bigint, int) to authenticated;
