CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type TEXT NOT NULL CHECK (owner_type IN ('client')),
  client_portal_account_id UUID NOT NULL REFERENCES client_portal_accounts(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  device_label TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_portal_account_active
  ON push_subscriptions (client_portal_account_id, is_active);

CREATE TABLE IF NOT EXISTS push_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_portal_account_id UUID NOT NULL UNIQUE REFERENCES client_portal_accounts(id) ON DELETE CASCADE,
  pass_expiry_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  pass_assigned_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  session_reminders_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS push_preferences_updated_at ON push_preferences;
CREATE TRIGGER push_preferences_updated_at
  BEFORE UPDATE ON push_preferences
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

ALTER TABLE notification_log
  ADD COLUMN IF NOT EXISTS dedupe_key TEXT;

ALTER TABLE notification_log
  DROP CONSTRAINT IF EXISTS notification_log_channel_check;

ALTER TABLE notification_log
  ADD CONSTRAINT notification_log_channel_check
  CHECK (channel IN ('internal', 'email', 'push'));

ALTER TABLE notification_log
  DROP CONSTRAINT IF EXISTS notification_log_event_type_check;

ALTER TABLE notification_log
  ADD CONSTRAINT notification_log_event_type_check
  CHECK (
    event_type IN (
      'renewal_confirmation',
      'expiry_reminder_d7',
      'expiry_reminder_d0',
      'manual_note',
      'pass_expiry_d7',
      'pass_expiry_d0',
      'pass_assigned',
      'calendar_session_24h'
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_log_dedupe_key_unique
  ON notification_log (dedupe_key)
  WHERE dedupe_key IS NOT NULL;
