-- Conservative FK indexes for high-use public tables.
-- Avoids duplicating existing composite indexes where the FK is already the leading column.

CREATE INDEX IF NOT EXISTS idx_audit_logs_gym_id
  ON audit_logs (gym_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_profile_id
  ON audit_logs (actor_profile_id);

CREATE INDEX IF NOT EXISTS idx_passes_created_by_profile_id
  ON passes (created_by_profile_id);

CREATE INDEX IF NOT EXISTS idx_passes_pass_type_id
  ON passes (pass_type_id);

CREATE INDEX IF NOT EXISTS idx_passes_purchased_by_client_id
  ON passes (purchased_by_client_id);

CREATE INDEX IF NOT EXISTS idx_passes_renewed_from_pass_id
  ON passes (renewed_from_pass_id);

CREATE INDEX IF NOT EXISTS idx_pass_pauses_pass_id
  ON pass_pauses (pass_id);

CREATE INDEX IF NOT EXISTS idx_pass_pauses_gym_id
  ON pass_pauses (gym_id);

CREATE INDEX IF NOT EXISTS idx_pass_pauses_approved_by_profile_id
  ON pass_pauses (approved_by_profile_id);

CREATE INDEX IF NOT EXISTS idx_calendar_sessions_client_1_id
  ON calendar_sessions (client_1_id);

CREATE INDEX IF NOT EXISTS idx_calendar_sessions_client_2_id
  ON calendar_sessions (client_2_id);

CREATE INDEX IF NOT EXISTS idx_calendar_sessions_pass_id
  ON calendar_sessions (pass_id);

CREATE INDEX IF NOT EXISTS idx_calendar_sessions_created_by_profile_id
  ON calendar_sessions (created_by_profile_id);

CREATE INDEX IF NOT EXISTS idx_calendar_session_passes_gym_id
  ON calendar_session_passes (gym_id);

CREATE INDEX IF NOT EXISTS idx_session_consumptions_client_id
  ON session_consumptions (client_id);

CREATE INDEX IF NOT EXISTS idx_session_consumptions_recorded_by_profile_id
  ON session_consumptions (recorded_by_profile_id);

CREATE INDEX IF NOT EXISTS idx_sales_client_id
  ON sales (client_id);

CREATE INDEX IF NOT EXISTS idx_sales_handled_by_profile_id
  ON sales (handled_by_profile_id);

CREATE INDEX IF NOT EXISTS idx_sale_items_gym_id
  ON sale_items (gym_id);

CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id
  ON sale_items (sale_id);

CREATE INDEX IF NOT EXISTS idx_sale_items_product_id
  ON sale_items (product_id);

CREATE INDEX IF NOT EXISTS idx_sale_items_pass_id
  ON sale_items (pass_id);

CREATE INDEX IF NOT EXISTS idx_notification_log_client_id
  ON notification_log (client_id);

CREATE INDEX IF NOT EXISTS idx_client_portal_accounts_client_id
  ON client_portal_accounts (client_id);

CREATE INDEX IF NOT EXISTS idx_client_portal_accounts_auth_user_id
  ON client_portal_accounts (auth_user_id);

CREATE INDEX IF NOT EXISTS idx_nutrition_threads_nutrition_profile_id
  ON nutrition_threads (nutrition_profile_id);

CREATE INDEX IF NOT EXISTS idx_nutrition_messages_gym_id
  ON nutrition_messages (gym_id);

CREATE INDEX IF NOT EXISTS idx_nutrition_usage_events_gym_id
  ON nutrition_usage_events (gym_id);

CREATE INDEX IF NOT EXISTS idx_nutrition_usage_events_message_id
  ON nutrition_usage_events (message_id);

CREATE INDEX IF NOT EXISTS idx_weekly_nutrition_plans_nutrition_profile_id
  ON weekly_nutrition_plans (nutrition_profile_id);

CREATE INDEX IF NOT EXISTS idx_push_preferences_client_portal_account_id
  ON push_preferences (client_portal_account_id);

ANALYZE audit_logs;
ANALYZE passes;
ANALYZE pass_pauses;
ANALYZE calendar_sessions;
ANALYZE calendar_session_passes;
ANALYZE session_consumptions;
ANALYZE sales;
ANALYZE sale_items;
ANALYZE notification_log;
ANALYZE client_portal_accounts;
ANALYZE nutrition_threads;
ANALYZE nutrition_messages;
ANALYZE nutrition_usage_events;
ANALYZE weekly_nutrition_plans;
ANALYZE push_preferences;
