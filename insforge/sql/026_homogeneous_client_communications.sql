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
