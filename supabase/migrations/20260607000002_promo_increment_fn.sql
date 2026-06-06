-- Атомарная функция инкремента uses_count для промокода
-- Вызывается из Edge Function create-payment через service_role
CREATE OR REPLACE FUNCTION public.increment_promo_uses(p_code text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE promo_codes
  SET uses_count = uses_count + 1
  WHERE code = p_code;
$$;
