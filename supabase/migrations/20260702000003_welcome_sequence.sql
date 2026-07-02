-- ── Онбординг-цепочка писем day-1/3/6: колонки идемпотентности ────────────────
-- Фаза H п.10. Каждая колонка = отметка времени отправки соответствующего письма,
-- чтобы ежедневный cron (welcome-sequence) не слал повторно. День с регистрации
-- вычисляется в функции как (subscription_expires_at - 7 дней), отдельный created_at
-- не нужен (триал всегда 7 дней).

alter table public.profiles
  add column if not exists welcome_d1_at timestamptz,
  add column if not exists welcome_d3_at timestamptz,
  add column if not exists welcome_d6_at timestamptz;
