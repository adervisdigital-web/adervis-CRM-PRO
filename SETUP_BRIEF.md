# Настройка онлайн-брифа

## Шаг 1 — Создать таблицу в Supabase

Откройте [Supabase SQL Editor](https://supabase.com/dashboard/project/qzeylogyledmhjpzvgkk/sql) и выполните:

```sql
create table if not exists brief_submissions (
  id uuid default gen_random_uuid() primary key,
  agency_id text not null,
  client_name text,
  client_phone text,
  client_email text,
  project_type text,
  description text,
  budget text,
  deadline text,
  status text default 'new',
  deal_id text,
  submitted_at timestamptz default now()
);

-- Включить RLS
alter table brief_submissions enable row level security;

-- Любой (даже не авторизованный) может отправить заявку
create policy "anyone can insert brief" on brief_submissions
  for insert with check (true);

-- Только владелец агентства видит свои заявки
create policy "agency owner can select briefs" on brief_submissions
  for select using (
    agency_id = auth.uid()::text
    or agency_id in (
      select agency_id from profiles where id = auth.uid()
    )
  );

-- Владелец агентства может обновлять (пометить как converted)
create policy "agency owner can update briefs" on brief_submissions
  for update using (
    agency_id = auth.uid()::text
    or agency_id in (
      select agency_id from profiles where id = auth.uid()
    )
  );

-- Владелец агентства может удалять
create policy "agency owner can delete briefs" on brief_submissions
  for delete using (
    agency_id = auth.uid()::text
    or agency_id in (
      select agency_id from profiles where id = auth.uid()
    )
  );
```

## Шаг 2 — Использование

1. Войдите в Adervis PRO
2. Откройте **Настройки** → блок **Онлайн-бриф**
3. Скопируйте персональную ссылку вида `https://app.adervis.ru/?brief=ВАШ_ID`
4. Поделитесь ссылкой с клиентом — через мессенджер, сайт, соцсети
5. Клиент заполнит форму (без регистрации), заявка появится в разделе **Брифы**
6. Нажмите **Создать сделку** — клиент и сделка создадутся автоматически

## Примечание

- Ссылка уникальна для каждого аккаунта (по `agency_id`)
- Данные клиентов разных аккаунтов не пересекаются (RLS)
- Повторная заявка от того же клиента не создаёт дубликат клиента
