-- ═══════════════════════════════════════════════════════════════════════
-- Fix: _is_super_admin() — использовать subquery к auth.users
-- вместо auth.jwt() ->> 'email' (JWT не всегда содержит email claim)
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION _is_super_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = auth.uid()
      AND email = 'adervis.digital@gmail.com'
  );
$$;
