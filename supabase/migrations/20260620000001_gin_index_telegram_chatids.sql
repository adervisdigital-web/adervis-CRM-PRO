-- GIN index on telegramChatIds array inside state_json JSONB.
-- telegram-webhook scans the whole agency_state table on every message
-- to find the agency by chatId. This index makes that lookup O(log n).
CREATE INDEX IF NOT EXISTS idx_agency_state_telegram_chatids
  ON agency_state USING gin ((state_json -> 'telegramChatIds'));
