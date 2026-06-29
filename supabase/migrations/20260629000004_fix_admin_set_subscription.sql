-- ═══════════════════════════════════════════════════════════════════════
-- Fix: admin_set_subscription — принимает p_agency_id как text
-- (JS/JSON передаёт UUID как строку; PostgreSQL не кастует text→uuid
--  автоматически в WHERE-условии, отсюда "operator does not exist")
-- ═══════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS admin_set_subscription(uuid, text, text, timestamptz);
DROP FUNCTION IF EXISTS admin_set_subscription(text, text, text, timestamptz);

CREATE OR REPLACE FUNCTION admin_set_subscription(
  p_agency_id   text,
  p_status      text,
  p_plan        text,
  p_expires_at  timestamptz
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
  WHERE agency_id = p_agency_id::uuid;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_set_subscription(text, text, text, timestamptz)
  TO authenticated;
