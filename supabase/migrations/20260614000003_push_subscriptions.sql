-- ═══════════════════════════════════════════════════════
-- Web Push подписки
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  agency_id   text        NOT NULL,
  user_id     uuid        REFERENCES profiles(id) ON DELETE CASCADE,
  endpoint    text        NOT NULL,
  p256dh      text        NOT NULL,
  auth_key    text        NOT NULL,
  created_at  timestamptz DEFAULT now(),
  UNIQUE (agency_id, endpoint)
);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "push_own_agency" ON push_subscriptions;
CREATE POLICY "push_own_agency" ON push_subscriptions
  FOR ALL USING (
    agency_id = (SELECT agency_id FROM profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    agency_id = (SELECT agency_id FROM profiles WHERE id = auth.uid())
  );
