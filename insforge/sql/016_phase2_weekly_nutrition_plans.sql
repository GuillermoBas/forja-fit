ALTER TABLE audit_logs
  DROP CONSTRAINT IF EXISTS audit_logs_action_check;

ALTER TABLE audit_logs
  ADD CONSTRAINT audit_logs_action_check
  CHECK (
    action IN (
      'create',
      'update',
      'delete',
      'renew',
      'consume',
      'pause',
      'void_sale',
      'send_notification',
      'login',
      'portal_claim',
      'portal_login',
      'nutrition_memory_update',
      'nutrition_chat_reset',
      'nutrition_memory_reset',
      'nutrition_plan_save',
      'nutrition_plan_delete'
    )
  );

CREATE TABLE IF NOT EXISTS weekly_nutrition_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  nutrition_profile_id UUID NOT NULL REFERENCES client_nutrition_profiles(id) ON DELETE CASCADE,
  week_starts_on DATE NOT NULL,
  title TEXT NOT NULL,
  plan_json JSONB NOT NULL,
  generated_by_model TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT weekly_nutrition_plans_unique_week UNIQUE (client_id, week_starts_on)
);

CREATE INDEX IF NOT EXISTS idx_weekly_nutrition_plans_client_week
  ON weekly_nutrition_plans (client_id, week_starts_on DESC);

DROP TRIGGER IF EXISTS weekly_nutrition_plans_updated_at ON weekly_nutrition_plans;
CREATE TRIGGER weekly_nutrition_plans_updated_at
  BEFORE UPDATE ON weekly_nutrition_plans
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
