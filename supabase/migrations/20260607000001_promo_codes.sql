-- ═══════════════════════════════════════════════════════
-- Промокоды для скидок на подписку
-- Выполни в Supabase Dashboard → SQL Editor
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.promo_codes (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  code            text        UNIQUE NOT NULL,
  discount_percent int        NOT NULL CHECK (discount_percent BETWEEN 1 AND 100),
  max_uses        int,                            -- NULL = безлимит
  uses_count      int         NOT NULL DEFAULT 0,
  expires_at      timestamptz,                    -- NULL = бессрочно
  is_active       boolean     NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Только авторизованные пользователи могут читать активные коды (для валидации)
ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "promo_codes_read_active" ON public.promo_codes
  FOR SELECT TO authenticated
  USING (is_active = true);

-- Запись только через Edge Function (service_role) — клиент не может писать
-- (нет INSERT/UPDATE политик для authenticated)

-- Пример промокода для теста (удали после проверки):
-- INSERT INTO promo_codes (code, discount_percent, max_uses) VALUES ('ADERVIS20', 20, 100);
