-- ── client_errors — телеметрия клиентских ошибок (Фаза 0 п.3) ─────────────────
-- Применить один раз в Supabase Dashboard → SQL Editor.
-- Клиент пишет сюда из window.onerror / unhandledrejection (app.js, _reportClientError).

create table if not exists public.client_errors (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  kind       text not null check (kind in ('error','promise')),
  message    text not null check (char_length(message) <= 1000),
  source     text check (char_length(source) <= 300),
  url        text check (char_length(url) <= 300),
  ua         text check (char_length(ua) <= 300),
  agency_id  uuid
);

alter table public.client_errors enable row level security;

-- Писать могут все, включая незалогиненных — ошибки на auth gate важнее прочих
drop policy if exists "client_errors_insert_all" on public.client_errors;
create policy "client_errors_insert_all" on public.client_errors
  for insert to anon, authenticated
  with check (true);

-- Читать — только супер-админ (_is_super_admin() создана миграциями admin panel 20260629*)
drop policy if exists "client_errors_select_admin" on public.client_errors;
create policy "client_errors_select_admin" on public.client_errors
  for select to authenticated
  using (_is_super_admin());

create index if not exists client_errors_created_at_idx
  on public.client_errors (created_at desc);

-- Автоочистка старше 30 дней (опционально; pg_cron уже включён — см. subscription-reminder-daily):
-- select cron.schedule('client-errors-cleanup', '0 3 * * *',
--   $$delete from public.client_errors where created_at < now() - interval '30 days'$$);
