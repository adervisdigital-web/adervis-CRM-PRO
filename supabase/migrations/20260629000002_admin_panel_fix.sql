-- ═══════════════════════════════════════════════════════════════════════
-- Admin Panel fixes:
-- 1. admin_get_promo_codes — явные алиасы (discount_percent AS discount)
-- 2. admin_get_all_users — читает auth.users (все, включая без profiles)
-- ═══════════════════════════════════════════════════════════════════════

-- ─── Промокоды — исправление алиасов ───────────────────────────────────
CREATE OR REPLACE FUNCTION admin_get_promo_codes()
RETURNS TABLE (
  id          uuid,
  code        text,
  discount    int,
  uses        int,
  max_uses    int,
  expires_at  timestamptz,
  active      boolean,
  created_at  timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT _is_super_admin() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  RETURN QUERY
    SELECT
      p.id,
      p.code,
      p.discount_percent  AS discount,
      p.uses_count        AS uses,
      p.max_uses,
      p.expires_at,
      p.is_active         AS active,
      p.created_at
    FROM promo_codes p
    ORDER BY p.created_at DESC;
END;
$$;

-- ─── Все пользователи из auth.users (включая без профиля) ──────────────
CREATE OR REPLACE FUNCTION admin_get_all_users()
RETURNS TABLE (
  id                      uuid,
  email                   text,
  agency_id               uuid,
  subscription_status     text,
  subscription_plan       text,
  subscription_expires_at timestamptz,
  created_at              timestamptz,
  last_sign_in_at         timestamptz,
  email_confirmed         boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT _is_super_admin() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  RETURN QUERY
    SELECT
      u.id,
      u.email::text,
      p.agency_id,
      p.subscription_status,
      p.subscription_plan,
      p.subscription_expires_at,
      u.created_at,
      u.last_sign_in_at,
      (u.email_confirmed_at IS NOT NULL) AS email_confirmed
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.id = u.id
    ORDER BY u.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_get_promo_codes()  TO authenticated;
GRANT EXECUTE ON FUNCTION admin_get_all_users()    TO authenticated;
