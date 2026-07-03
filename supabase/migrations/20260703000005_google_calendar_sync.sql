-- Google Calendar: личное подключение на пользователя (двусторонняя синхронизация)

-- Разовый state для CSRF-защиты OAuth redirect (single-use, живёт минуты)
CREATE TABLE google_oauth_states (
  state uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE google_oauth_states ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON google_oauth_states FROM PUBLIC, anon, authenticated;
-- никаких policy — читает/пишет только service_role из Edge Function

-- Личное подключение Google Calendar, один на пользователя
CREATE TABLE google_calendar_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  google_email text,
  refresh_token text NOT NULL,
  access_token text,
  access_token_expires_at timestamptz,
  calendar_id text NOT NULL DEFAULT 'primary',
  connected_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE google_calendar_connections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON google_calendar_connections FROM PUBLIC, anon, authenticated;

-- Пользователь видит только безопасные поля своей строки (не refresh_token/access_token)
GRANT SELECT (id, google_email, calendar_id, connected_at, updated_at)
  ON google_calendar_connections TO authenticated;
CREATE POLICY "own_connection_select" ON google_calendar_connections
  FOR SELECT USING (user_id = (select auth.uid()));

-- Пользователь может отключить свой же коннект напрямую (без Edge Function)
GRANT DELETE ON google_calendar_connections TO authenticated;
CREATE POLICY "own_connection_delete" ON google_calendar_connections
  FOR DELETE USING (user_id = (select auth.uid()));

-- INSERT/UPDATE только через service_role (Edge Functions) — токены никогда не идут через RLS
