-- ═══════════════════════════════════════════════════════
-- Реферальная программа
-- agency_id в profiles хранится как text (не uuid)
-- ═══════════════════════════════════════════════════════

-- 1. Поле "кто пригласил" на профиле пользователя (text, как agency_id)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS referred_by_agency_id text DEFAULT NULL;

-- 2. Таблица фактов — каждый реферал, которому выдан бонус
CREATE TABLE IF NOT EXISTS referrals (
  id                  uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  referrer_agency_id  text        NOT NULL,
  referred_user_id    uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  bonus_days          integer     NOT NULL DEFAULT 30,
  bonus_granted_at    timestamptz DEFAULT NULL,
  created_at          timestamptz DEFAULT now(),
  UNIQUE (referred_user_id)   -- один реферал — один бонус
);

-- 3. RLS: агентство видит только своих рефералов
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "referrals_select_own" ON referrals;
CREATE POLICY "referrals_select_own" ON referrals
  FOR SELECT USING (
    referrer_agency_id = (
      SELECT agency_id FROM profiles WHERE id = auth.uid()
    )
  );

-- 4. Функция подсчёта статистики рефералов для текущего агентства
CREATE OR REPLACE FUNCTION get_referral_stats()
RETURNS TABLE (
  total_invited     bigint,
  total_paid        bigint,
  bonus_days_earned bigint
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    COUNT(*)                                                     AS total_invited,
    COUNT(*) FILTER (WHERE bonus_granted_at IS NOT NULL)         AS total_paid,
    COALESCE(SUM(bonus_days) FILTER (WHERE bonus_granted_at IS NOT NULL), 0) AS bonus_days_earned
  FROM referrals
  WHERE referrer_agency_id = (
    SELECT agency_id FROM profiles WHERE id = auth.uid()
  );
$$;

-- 5. Функция выдачи бонуса реферреру (вызывается из webhook через service_role)
CREATE OR REPLACE FUNCTION grant_referral_bonus(
  p_referred_user_id  uuid,
  p_bonus_days        integer DEFAULT 30
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_referrer_agency_id  text;
  v_referrer_profile_id uuid;
  v_current_expires     timestamptz;
  v_current_status      text;
  v_new_expires         timestamptz;
BEGIN
  -- Найти agency_id реферрера
  SELECT referred_by_agency_id INTO v_referrer_agency_id
  FROM profiles WHERE id = p_referred_user_id;

  IF v_referrer_agency_id IS NULL THEN RETURN; END IF;

  -- Найти профиль реферрера (владелец агентства)
  SELECT id, subscription_expires_at, subscription_status
  INTO v_referrer_profile_id, v_current_expires, v_current_status
  FROM profiles
  WHERE agency_id = v_referrer_agency_id
  ORDER BY created_at
  LIMIT 1;

  IF v_referrer_profile_id IS NULL THEN RETURN; END IF;

  -- Продлить подписку реферрера на bonus_days
  IF v_current_status = 'active' AND v_current_expires > now() THEN
    v_new_expires := v_current_expires + (p_bonus_days || ' days')::interval;
  ELSE
    v_new_expires := now() + (p_bonus_days || ' days')::interval;
  END IF;

  UPDATE profiles
  SET subscription_expires_at = v_new_expires,
      subscription_status     = 'active'
  WHERE id = v_referrer_profile_id;

  -- Записать факт выдачи бонуса (идемпотентность)
  INSERT INTO referrals (referrer_agency_id, referred_user_id, bonus_days, bonus_granted_at)
  VALUES (v_referrer_agency_id, p_referred_user_id, p_bonus_days, now())
  ON CONFLICT (referred_user_id) DO UPDATE
    SET bonus_granted_at = now()
    WHERE referrals.bonus_granted_at IS NULL;
END;
$$;
