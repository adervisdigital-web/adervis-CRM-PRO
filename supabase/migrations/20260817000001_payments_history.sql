-- ═══════════════════════════════════════════════════════════════════════════
-- История платежей
--
-- Зачем: до сих пор про оплату в базе хранилось ОДНО поле —
-- profiles.yookassa_last_payment_id, то есть id ПОСЛЕДНЕГО платежа. Ни суммы,
-- ни даты, ни промокода, ни истории: второй платёж стирал первый навсегда.
--
-- Что из этого ломалось:
--   • возврат средств считался вслепую — сумму и дату приходилось искать
--     руками в кабинете ЮKassa (см. REFUNDS.md §4);
--   • MRR в админке считался по активным подпискам, а не по полученным деньгам;
--   • бухгалтерия и чеки собирались только выгрузкой из ЮKassa.
--
-- Пишет сюда ТОЛЬКО вебхук yookassa-webhook под service_role, и только после
-- того, как платёж перепроверен обращением к API ЮKassa (подделать уведомление
-- нельзя — см. комментарий в самой функции).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.payments (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agency_id           text,
  yookassa_payment_id text        NOT NULL UNIQUE,   -- защита от повторной записи при переотправке уведомления
  amount              numeric(12,2) NOT NULL,
  currency            text        NOT NULL DEFAULT 'RUB',
  plan                text,
  promo_code          text,
  discount_percent    int,
  paid_at             timestamptz NOT NULL DEFAULT now(),
  -- Возврат: заполняется вручную из админки после фактического возврата в ЮKassa.
  -- Автоматического возврата по API сознательно нет (REFUNDS.md §5).
  refunded_at         timestamptz,
  refund_amount       numeric(12,2),
  refund_reason       text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payments_user_idx    ON public.payments (user_id, paid_at DESC);
CREATE INDEX IF NOT EXISTS payments_agency_idx  ON public.payments (agency_id, paid_at DESC);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- Свои платежи человек видит: это его деньги и его чеки.
DROP POLICY IF EXISTS "payments_read_own" ON public.payments;
CREATE POLICY "payments_read_own" ON public.payments
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

-- Записи нет ни у кого, кроме service_role: у authenticated нет ни INSERT,
-- ни UPDATE, ни DELETE политик — значит, клиент не может выписать себе платёж.

-- ── Чтение для админки ─────────────────────────────────────────────────────
-- Отдельная функция, а не политика «админ видит всё»: права проверяются внутри,
-- как у остальных admin_* (см. _is_super_admin).
CREATE OR REPLACE FUNCTION public.admin_get_payments(p_limit int DEFAULT 200)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT _is_super_admin() THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO result
  FROM (
    SELECT p.id, p.user_id, p.agency_id, p.yookassa_payment_id, p.amount, p.currency,
           p.plan, p.promo_code, p.discount_percent, p.paid_at,
           p.refunded_at, p.refund_amount, p.refund_reason,
           u.email
    FROM public.payments p
    LEFT JOIN auth.users u ON u.id = p.user_id
    ORDER BY p.paid_at DESC
    LIMIT greatest(1, least(p_limit, 1000))
  ) t;

  RETURN result;
END;
$$;

-- ── Отметка возврата из админки ────────────────────────────────────────────
-- Деньги возвращает человек руками в кабинете ЮKassa; эта функция только
-- фиксирует факт, чтобы он не потерялся и попал в отчётность.
CREATE OR REPLACE FUNCTION public.admin_mark_refund(
  p_payment_id uuid,
  p_amount     numeric,
  p_reason     text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT _is_super_admin() THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  UPDATE public.payments
     SET refunded_at   = now(),
         refund_amount = p_amount,
         refund_reason = p_reason
   WHERE id = p_payment_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_payments(int) FROM public;
REVOKE ALL ON FUNCTION public.admin_get_payments(int) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_get_payments(int) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_mark_refund(uuid, numeric, text) FROM public;
REVOKE ALL ON FUNCTION public.admin_mark_refund(uuid, numeric, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_mark_refund(uuid, numeric, text) TO authenticated;
