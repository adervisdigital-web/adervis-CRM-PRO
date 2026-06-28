-- ═══════════════════════════════════════════════════════════════════════
-- Admin Panel RPC functions
-- Доступ только для superadmin (adervis.digital@gmail.com)
-- SECURITY DEFINER обходит RLS — функции сами проверяют email вызывающего
-- Выполни в Supabase Dashboard → SQL Editor
-- ═══════════════════════════════════════════════════════════════════════

-- Проверка суперадмина (используется во всех функциях ниже)
CREATE OR REPLACE FUNCTION _is_super_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN (auth.jwt() ->> 'email') = 'adervis.digital@gmail.com';
END;
$$;

-- ─── Получить список всех профилей ─────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_get_profiles()
RETURNS TABLE (
  id              uuid,
  email           text,
  agency_id       uuid,
  subscription_status text,
  subscription_plan   text,
  subscription_expires_at timestamptz,
  created_at      timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT _is_super_admin() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  RETURN QUERY
    SELECT p.id, p.email, p.agency_id,
           p.subscription_status, p.subscription_plan,
           p.subscription_expires_at, p.created_at
    FROM profiles p
    ORDER BY p.created_at DESC;
END;
$$;

-- ─── Изменить подписку агентства ───────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_set_subscription(
  p_agency_id       uuid,
  p_status          text,
  p_plan            text,
  p_expires_at      timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT _is_super_admin() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  UPDATE profiles
  SET subscription_status     = p_status,
      subscription_plan       = p_plan,
      subscription_expires_at = p_expires_at
  WHERE agency_id = p_agency_id;
END;
$$;

-- ─── Получить все промокоды ─────────────────────────────────────────────
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
    SELECT p.id, p.code, p.discount_percent, p.uses_count, p.max_uses,
           p.expires_at, p.is_active, p.created_at
    FROM promo_codes p
    ORDER BY p.created_at DESC;
END;
$$;

-- ─── Создать промокод ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_create_promo(
  p_code      text,
  p_discount  int,
  p_max_uses  int,
  p_expires   timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT _is_super_admin() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  INSERT INTO promo_codes (code, discount_percent, max_uses, expires_at, is_active)
  VALUES (upper(trim(p_code)), p_discount, p_max_uses, p_expires, true);
END;
$$;

-- ─── Включить / отключить промокод ─────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_toggle_promo(p_id uuid, p_active boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT _is_super_admin() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  UPDATE promo_codes SET is_active = p_active WHERE id = p_id;
END;
$$;

-- Права на вызов — только для авторизованных пользователей
-- (внутри функций уже проверяется суперадмин-email)
GRANT EXECUTE ON FUNCTION admin_get_profiles()                               TO authenticated;
GRANT EXECUTE ON FUNCTION admin_set_subscription(uuid,text,text,timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_get_promo_codes()                            TO authenticated;
GRANT EXECUTE ON FUNCTION admin_create_promo(text,int,int,timestamptz)       TO authenticated;
GRANT EXECUTE ON FUNCTION admin_toggle_promo(uuid,boolean)                   TO authenticated;
