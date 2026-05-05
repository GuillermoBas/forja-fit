CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS gyms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  primary_domain TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO gyms (slug, name, primary_domain, status)
VALUES ('eltemplo', 'El Templo', 'eltemplo.trainium.es', 'active')
ON CONFLICT (slug) DO UPDATE
   SET name = EXCLUDED.name,
       primary_domain = EXCLUDED.primary_domain,
       status = EXCLUDED.status,
       updated_at = NOW();

DROP TRIGGER IF EXISTS gyms_updated_at ON gyms;
CREATE TRIGGER gyms_updated_at
  BEFORE UPDATE ON gyms
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

DO $$
DECLARE
  table_name TEXT;
  eltemplo_id UUID;
  null_count BIGINT;
BEGIN
  SELECT id INTO eltemplo_id FROM gyms WHERE slug = 'eltemplo';

  FOREACH table_name IN ARRAY ARRAY[
    'profiles',
    'settings',
    'clients',
    'pass_types',
    'passes',
    'pass_holders',
    'pass_pauses',
    'session_consumptions',
    'products',
    'sales',
    'sale_items',
    'expenses',
    'calendar_sessions',
    'calendar_session_passes',
    'notification_log',
    'audit_logs',
    'job_runs',
    'client_portal_accounts',
    'client_nutrition_profiles',
    'nutrition_threads',
    'nutrition_messages',
    'nutrition_usage_events',
    'weekly_nutrition_plans',
    'push_subscriptions',
    'push_preferences'
  ] LOOP
    IF to_regclass(table_name) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS gym_id UUID REFERENCES gyms(id)', table_name);
      EXECUTE format('UPDATE %I SET gym_id = $1 WHERE gym_id IS NULL', table_name) USING eltemplo_id;
      EXECUTE format('SELECT COUNT(*) FROM %I WHERE gym_id IS NULL', table_name) INTO null_count;

      IF null_count > 0 THEN
        RAISE EXCEPTION 'Multitenant migration blocked: %.gym_id still has % null rows', table_name, null_count;
      END IF;

      EXECUTE format('ALTER TABLE %I ALTER COLUMN gym_id SET NOT NULL', table_name);
    END IF;
  END LOOP;
END $$;

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_auth_user_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_gym_auth_user_id_key
  ON profiles (gym_id, auth_user_id);
CREATE UNIQUE INDEX IF NOT EXISTS profiles_gym_email_key
  ON profiles (gym_id, lower(email));

ALTER TABLE pass_types DROP CONSTRAINT IF EXISTS pass_types_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS pass_types_gym_name_key
  ON pass_types (gym_id, lower(name));

ALTER TABLE products DROP CONSTRAINT IF EXISTS products_sku_key;
CREATE UNIQUE INDEX IF NOT EXISTS products_gym_sku_key
  ON products (gym_id, lower(sku))
  WHERE sku IS NOT NULL AND trim(sku) <> '';

ALTER TABLE sales DROP CONSTRAINT IF EXISTS sales_invoice_code_key;
ALTER TABLE sales DROP CONSTRAINT IF EXISTS sales_invoice_series_invoice_seq_key;
CREATE UNIQUE INDEX IF NOT EXISTS sales_gym_invoice_code_key
  ON sales (gym_id, invoice_code);
CREATE UNIQUE INDEX IF NOT EXISTS sales_gym_invoice_series_seq_key
  ON sales (gym_id, invoice_series, invoice_seq);

ALTER TABLE job_runs DROP CONSTRAINT IF EXISTS job_runs_job_key_run_for_date_key;
CREATE UNIQUE INDEX IF NOT EXISTS job_runs_gym_job_key_run_for_date_key
  ON job_runs (gym_id, job_key, run_for_date);

ALTER TABLE client_portal_accounts DROP CONSTRAINT IF EXISTS client_portal_accounts_client_id_key;
ALTER TABLE client_portal_accounts DROP CONSTRAINT IF EXISTS client_portal_accounts_auth_user_id_key;
DROP INDEX IF EXISTS idx_client_portal_accounts_email_normalized;
CREATE UNIQUE INDEX IF NOT EXISTS client_portal_accounts_gym_client_id_key
  ON client_portal_accounts (gym_id, client_id);
CREATE UNIQUE INDEX IF NOT EXISTS client_portal_accounts_gym_auth_user_id_key
  ON client_portal_accounts (gym_id, auth_user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_client_portal_accounts_gym_email_normalized
  ON client_portal_accounts (gym_id, email_normalized);

DROP INDEX IF EXISTS idx_notification_log_dedupe_key_unique;
CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_log_gym_dedupe_key_unique
  ON notification_log (gym_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;

DROP INDEX IF EXISTS idx_calendar_sessions_unique_trainer_slot;
CREATE UNIQUE INDEX IF NOT EXISTS idx_calendar_sessions_gym_unique_trainer_slot
  ON calendar_sessions (gym_id, trainer_profile_id, starts_at, ends_at)
  WHERE status <> 'cancelled';

ALTER TABLE weekly_nutrition_plans DROP CONSTRAINT IF EXISTS weekly_nutrition_plans_unique_week;
CREATE UNIQUE INDEX IF NOT EXISTS weekly_nutrition_plans_gym_unique_week
  ON weekly_nutrition_plans (gym_id, client_id, week_starts_on);

DROP INDEX IF EXISTS idx_nutrition_threads_active_client;
CREATE UNIQUE INDEX IF NOT EXISTS idx_nutrition_threads_gym_active_client
  ON nutrition_threads (gym_id, client_id)
  WHERE status = 'active';

ALTER TABLE client_nutrition_profiles DROP CONSTRAINT IF EXISTS client_nutrition_profiles_client_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS client_nutrition_profiles_gym_client_id_key
  ON client_nutrition_profiles (gym_id, client_id);

ALTER TABLE push_subscriptions DROP CONSTRAINT IF EXISTS push_subscriptions_endpoint_key;
CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_gym_endpoint_key
  ON push_subscriptions (gym_id, endpoint);

ALTER TABLE push_preferences DROP CONSTRAINT IF EXISTS push_preferences_client_portal_account_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS push_preferences_gym_portal_account_key
  ON push_preferences (gym_id, client_portal_account_id);

DROP INDEX IF EXISTS idx_session_consumptions_unique_session_pass;
CREATE UNIQUE INDEX IF NOT EXISTS idx_session_consumptions_gym_unique_session_pass
  ON session_consumptions (gym_id, calendar_session_id, pass_id)
  WHERE calendar_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_gym_role ON profiles (gym_id, role, is_active);
CREATE INDEX IF NOT EXISTS idx_clients_gym_name ON clients (gym_id, last_name, first_name);
CREATE INDEX IF NOT EXISTS idx_passes_gym_status_expires ON passes (gym_id, status, expires_on);
CREATE INDEX IF NOT EXISTS idx_products_gym_stock ON products (gym_id, stock_on_hand);
CREATE INDEX IF NOT EXISTS idx_sales_gym_sold_at ON sales (gym_id, sold_at DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_gym_spent_on ON expenses (gym_id, spent_on DESC);
CREATE INDEX IF NOT EXISTS idx_calendar_sessions_gym_trainer_date ON calendar_sessions (gym_id, trainer_profile_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_notification_log_gym_created_at ON notification_log (gym_id, created_at DESC);

CREATE OR REPLACE FUNCTION app_require_same_gym(
  p_expected_gym_id UUID,
  p_actual_gym_id UUID,
  p_message TEXT
) RETURNS VOID AS $$
BEGIN
  IF p_expected_gym_id IS NULL OR p_actual_gym_id IS NULL OR p_expected_gym_id <> p_actual_gym_id THEN
    RAISE EXCEPTION '%', p_message;
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION set_pass_related_gym_id()
RETURNS TRIGGER AS $$
DECLARE
  v_gym_id UUID;
  v_client_gym_id UUID;
BEGIN
  SELECT gym_id INTO v_gym_id FROM passes WHERE id = NEW.pass_id;
  IF v_gym_id IS NULL THEN
    RAISE EXCEPTION 'Bono no encontrado para asignar gimnasio';
  END IF;

  IF TG_TABLE_NAME IN ('pass_holders', 'session_consumptions') THEN
    SELECT gym_id INTO v_client_gym_id FROM clients WHERE id = NEW.client_id;
    PERFORM app_require_same_gym(v_gym_id, v_client_gym_id, 'El cliente no pertenece al gimnasio del bono');
  END IF;

  NEW.gym_id := v_gym_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION set_sale_item_gym_id()
RETURNS TRIGGER AS $$
DECLARE
  v_gym_id UUID;
  v_product_gym_id UUID;
  v_pass_gym_id UUID;
BEGIN
  SELECT gym_id INTO v_gym_id FROM sales WHERE id = NEW.sale_id;
  IF v_gym_id IS NULL THEN
    RAISE EXCEPTION 'Venta no encontrada para asignar gimnasio';
  END IF;

  IF NEW.product_id IS NOT NULL THEN
    SELECT gym_id INTO v_product_gym_id FROM products WHERE id = NEW.product_id;
    PERFORM app_require_same_gym(v_gym_id, v_product_gym_id, 'El producto no pertenece al gimnasio de la venta');
  END IF;

  IF NEW.pass_id IS NOT NULL THEN
    SELECT gym_id INTO v_pass_gym_id FROM passes WHERE id = NEW.pass_id;
    PERFORM app_require_same_gym(v_gym_id, v_pass_gym_id, 'El bono no pertenece al gimnasio de la venta');
  END IF;

  NEW.gym_id := v_gym_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION set_calendar_session_pass_gym_id()
RETURNS TRIGGER AS $$
DECLARE
  v_gym_id UUID;
  v_pass_gym_id UUID;
BEGIN
  SELECT gym_id INTO v_gym_id FROM calendar_sessions WHERE id = NEW.session_id;
  SELECT gym_id INTO v_pass_gym_id FROM passes WHERE id = NEW.pass_id;
  PERFORM app_require_same_gym(v_gym_id, v_pass_gym_id, 'El bono no pertenece al gimnasio de la cita');
  NEW.gym_id := v_gym_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION set_portal_child_gym_id()
RETURNS TRIGGER AS $$
DECLARE
  v_gym_id UUID;
BEGIN
  SELECT gym_id INTO v_gym_id
    FROM client_portal_accounts
   WHERE id = NEW.client_portal_account_id;

  IF v_gym_id IS NULL THEN
    RAISE EXCEPTION 'Cuenta de portal no encontrada para asignar gimnasio';
  END IF;

  NEW.gym_id := v_gym_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION set_client_nutrition_gym_id()
RETURNS TRIGGER AS $$
DECLARE
  v_gym_id UUID;
BEGIN
  SELECT gym_id INTO v_gym_id FROM clients WHERE id = NEW.client_id;
  IF v_gym_id IS NULL THEN
    RAISE EXCEPTION 'Cliente no encontrado para asignar gimnasio';
  END IF;
  NEW.gym_id := v_gym_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION set_nutrition_message_gym_id()
RETURNS TRIGGER AS $$
DECLARE
  v_gym_id UUID;
  v_client_gym_id UUID;
BEGIN
  SELECT gym_id INTO v_gym_id FROM nutrition_threads WHERE id = NEW.thread_id;
  SELECT gym_id INTO v_client_gym_id FROM clients WHERE id = NEW.client_id;
  PERFORM app_require_same_gym(v_gym_id, v_client_gym_id, 'El mensaje nutricional no pertenece al gimnasio del hilo');
  NEW.gym_id := v_gym_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION set_notification_gym_id()
RETURNS TRIGGER AS $$
DECLARE
  v_gym_id UUID;
BEGIN
  IF NEW.gym_id IS NOT NULL THEN
    v_gym_id := NEW.gym_id;
  ELSIF NEW.client_id IS NOT NULL THEN
    SELECT gym_id INTO v_gym_id FROM clients WHERE id = NEW.client_id;
  ELSIF NEW.pass_id IS NOT NULL THEN
    SELECT gym_id INTO v_gym_id FROM passes WHERE id = NEW.pass_id;
  ELSIF NEW.sale_id IS NOT NULL THEN
    SELECT gym_id INTO v_gym_id FROM sales WHERE id = NEW.sale_id;
  END IF;

  IF v_gym_id IS NULL THEN
    RAISE EXCEPTION 'No se pudo asignar gimnasio a la notificacion';
  END IF;

  NEW.gym_id := v_gym_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION set_audit_gym_id()
RETURNS TRIGGER AS $$
DECLARE
  v_gym_id UUID;
BEGIN
  IF NEW.actor_profile_id IS NOT NULL THEN
    SELECT gym_id INTO v_gym_id FROM profiles WHERE id = NEW.actor_profile_id;
  ELSIF NEW.diff ? 'client_id' THEN
    SELECT gym_id INTO v_gym_id FROM clients WHERE id = (NEW.diff ->> 'client_id')::uuid;
  ELSIF NEW.diff ? 'portal_account_id' THEN
    SELECT gym_id INTO v_gym_id FROM client_portal_accounts WHERE id = (NEW.diff ->> 'portal_account_id')::uuid;
  END IF;

  IF v_gym_id IS NULL AND NEW.gym_id IS NOT NULL THEN
    v_gym_id := NEW.gym_id;
  END IF;

  IF v_gym_id IS NULL THEN
    SELECT id INTO v_gym_id FROM gyms WHERE slug = 'eltemplo';
  END IF;

  NEW.gym_id := v_gym_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION validate_pass_gym_references()
RETURNS TRIGGER AS $$
DECLARE
  v_pass_type_gym_id UUID;
  v_client_gym_id UUID;
  v_profile_gym_id UUID;
BEGIN
  SELECT gym_id INTO v_pass_type_gym_id FROM pass_types WHERE id = NEW.pass_type_id;
  SELECT gym_id INTO v_profile_gym_id FROM profiles WHERE id = NEW.created_by_profile_id;
  PERFORM app_require_same_gym(NEW.gym_id, v_pass_type_gym_id, 'El tipo de bono no pertenece al gimnasio del bono');
  PERFORM app_require_same_gym(NEW.gym_id, v_profile_gym_id, 'El perfil creador no pertenece al gimnasio del bono');

  IF NEW.purchased_by_client_id IS NOT NULL THEN
    SELECT gym_id INTO v_client_gym_id FROM clients WHERE id = NEW.purchased_by_client_id;
    PERFORM app_require_same_gym(NEW.gym_id, v_client_gym_id, 'El comprador no pertenece al gimnasio del bono');
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION validate_sale_gym_references()
RETURNS TRIGGER AS $$
DECLARE
  v_client_gym_id UUID;
  v_profile_gym_id UUID;
BEGIN
  SELECT gym_id INTO v_profile_gym_id FROM profiles WHERE id = NEW.handled_by_profile_id;
  PERFORM app_require_same_gym(NEW.gym_id, v_profile_gym_id, 'El perfil no pertenece al gimnasio de la venta');

  IF NEW.client_id IS NOT NULL THEN
    SELECT gym_id INTO v_client_gym_id FROM clients WHERE id = NEW.client_id;
    PERFORM app_require_same_gym(NEW.gym_id, v_client_gym_id, 'El cliente no pertenece al gimnasio de la venta');
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION validate_calendar_session_gym_references()
RETURNS TRIGGER AS $$
DECLARE
  v_trainer_gym_id UUID;
  v_client_1_gym_id UUID;
  v_client_2_gym_id UUID;
  v_created_by_gym_id UUID;
  v_pass_gym_id UUID;
BEGIN
  SELECT gym_id INTO v_trainer_gym_id FROM profiles WHERE id = NEW.trainer_profile_id;
  SELECT gym_id INTO v_client_1_gym_id FROM clients WHERE id = NEW.client_1_id;
  SELECT gym_id INTO v_created_by_gym_id FROM profiles WHERE id = NEW.created_by_profile_id;
  PERFORM app_require_same_gym(NEW.gym_id, v_trainer_gym_id, 'El entrenador no pertenece al gimnasio de la cita');
  PERFORM app_require_same_gym(NEW.gym_id, v_client_1_gym_id, 'El cliente no pertenece al gimnasio de la cita');
  PERFORM app_require_same_gym(NEW.gym_id, v_created_by_gym_id, 'El perfil creador no pertenece al gimnasio de la cita');

  IF NEW.client_2_id IS NOT NULL THEN
    SELECT gym_id INTO v_client_2_gym_id FROM clients WHERE id = NEW.client_2_id;
    PERFORM app_require_same_gym(NEW.gym_id, v_client_2_gym_id, 'El segundo cliente no pertenece al gimnasio de la cita');
  END IF;

  IF NEW.pass_id IS NOT NULL THEN
    SELECT gym_id INTO v_pass_gym_id FROM passes WHERE id = NEW.pass_id;
    PERFORM app_require_same_gym(NEW.gym_id, v_pass_gym_id, 'El bono no pertenece al gimnasio de la cita');
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION set_profile_owned_gym_id()
RETURNS TRIGGER AS $$
DECLARE
  v_profile_id UUID;
  v_gym_id UUID;
BEGIN
  v_profile_id := COALESCE(
    NULLIF(to_jsonb(NEW) ->> 'created_by_profile_id', '')::uuid,
    NULLIF(to_jsonb(NEW) ->> 'handled_by_profile_id', '')::uuid,
    NULLIF(to_jsonb(NEW) ->> 'approved_by_profile_id', '')::uuid,
    NULLIF(to_jsonb(NEW) ->> 'recorded_by_profile_id', '')::uuid,
    NULLIF(to_jsonb(NEW) ->> 'trainer_profile_id', '')::uuid
  );

  SELECT gym_id INTO v_gym_id FROM profiles WHERE id = v_profile_id;

  IF v_gym_id IS NULL THEN
    RAISE EXCEPTION 'No se pudo asignar gimnasio desde el perfil operativo';
  END IF;

  IF NEW.gym_id IS NOT NULL AND NEW.gym_id <> v_gym_id THEN
    RAISE EXCEPTION 'El registro pertenece a otro gimnasio';
  END IF;

  NEW.gym_id := v_gym_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS pass_holders_set_gym_id ON pass_holders;
CREATE TRIGGER pass_holders_set_gym_id
  BEFORE INSERT OR UPDATE ON pass_holders
  FOR EACH ROW EXECUTE FUNCTION set_pass_related_gym_id();

DROP TRIGGER IF EXISTS passes_set_gym_id ON passes;
CREATE TRIGGER passes_set_gym_id
  BEFORE INSERT OR UPDATE ON passes
  FOR EACH ROW EXECUTE FUNCTION set_profile_owned_gym_id();

DROP TRIGGER IF EXISTS sales_set_gym_id ON sales;
CREATE TRIGGER sales_set_gym_id
  BEFORE INSERT OR UPDATE ON sales
  FOR EACH ROW EXECUTE FUNCTION set_profile_owned_gym_id();

DROP TRIGGER IF EXISTS expenses_set_gym_id ON expenses;
CREATE TRIGGER expenses_set_gym_id
  BEFORE INSERT OR UPDATE ON expenses
  FOR EACH ROW EXECUTE FUNCTION set_profile_owned_gym_id();

DROP TRIGGER IF EXISTS calendar_sessions_set_gym_id ON calendar_sessions;
CREATE TRIGGER calendar_sessions_set_gym_id
  BEFORE INSERT OR UPDATE ON calendar_sessions
  FOR EACH ROW EXECUTE FUNCTION set_profile_owned_gym_id();

DROP TRIGGER IF EXISTS pass_pauses_set_gym_id ON pass_pauses;
CREATE TRIGGER pass_pauses_set_gym_id
  BEFORE INSERT OR UPDATE ON pass_pauses
  FOR EACH ROW EXECUTE FUNCTION set_pass_related_gym_id();

DROP TRIGGER IF EXISTS session_consumptions_set_gym_id ON session_consumptions;
CREATE TRIGGER session_consumptions_set_gym_id
  BEFORE INSERT OR UPDATE ON session_consumptions
  FOR EACH ROW EXECUTE FUNCTION set_pass_related_gym_id();

DROP TRIGGER IF EXISTS sale_items_set_gym_id ON sale_items;
CREATE TRIGGER sale_items_set_gym_id
  BEFORE INSERT OR UPDATE ON sale_items
  FOR EACH ROW EXECUTE FUNCTION set_sale_item_gym_id();

DROP TRIGGER IF EXISTS calendar_session_passes_set_gym_id ON calendar_session_passes;
CREATE TRIGGER calendar_session_passes_set_gym_id
  BEFORE INSERT OR UPDATE ON calendar_session_passes
  FOR EACH ROW EXECUTE FUNCTION set_calendar_session_pass_gym_id();

DROP TRIGGER IF EXISTS push_subscriptions_set_gym_id ON push_subscriptions;
CREATE TRIGGER push_subscriptions_set_gym_id
  BEFORE INSERT OR UPDATE ON push_subscriptions
  FOR EACH ROW EXECUTE FUNCTION set_portal_child_gym_id();

DROP TRIGGER IF EXISTS push_preferences_set_gym_id ON push_preferences;
CREATE TRIGGER push_preferences_set_gym_id
  BEFORE INSERT OR UPDATE ON push_preferences
  FOR EACH ROW EXECUTE FUNCTION set_portal_child_gym_id();

DROP TRIGGER IF EXISTS client_nutrition_profiles_set_gym_id ON client_nutrition_profiles;
CREATE TRIGGER client_nutrition_profiles_set_gym_id
  BEFORE INSERT OR UPDATE ON client_nutrition_profiles
  FOR EACH ROW EXECUTE FUNCTION set_client_nutrition_gym_id();

DROP TRIGGER IF EXISTS nutrition_threads_set_gym_id ON nutrition_threads;
CREATE TRIGGER nutrition_threads_set_gym_id
  BEFORE INSERT OR UPDATE ON nutrition_threads
  FOR EACH ROW EXECUTE FUNCTION set_client_nutrition_gym_id();

DROP TRIGGER IF EXISTS nutrition_usage_events_set_gym_id ON nutrition_usage_events;
CREATE TRIGGER nutrition_usage_events_set_gym_id
  BEFORE INSERT OR UPDATE ON nutrition_usage_events
  FOR EACH ROW EXECUTE FUNCTION set_client_nutrition_gym_id();

DROP TRIGGER IF EXISTS weekly_nutrition_plans_set_gym_id ON weekly_nutrition_plans;
CREATE TRIGGER weekly_nutrition_plans_set_gym_id
  BEFORE INSERT OR UPDATE ON weekly_nutrition_plans
  FOR EACH ROW EXECUTE FUNCTION set_client_nutrition_gym_id();

DROP TRIGGER IF EXISTS nutrition_messages_set_gym_id ON nutrition_messages;
CREATE TRIGGER nutrition_messages_set_gym_id
  BEFORE INSERT OR UPDATE ON nutrition_messages
  FOR EACH ROW EXECUTE FUNCTION set_nutrition_message_gym_id();

DROP TRIGGER IF EXISTS notification_log_set_gym_id ON notification_log;
CREATE TRIGGER notification_log_set_gym_id
  BEFORE INSERT OR UPDATE ON notification_log
  FOR EACH ROW EXECUTE FUNCTION set_notification_gym_id();

DROP TRIGGER IF EXISTS audit_logs_set_gym_id ON audit_logs;
CREATE TRIGGER audit_logs_set_gym_id
  BEFORE INSERT OR UPDATE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION set_audit_gym_id();

DROP TRIGGER IF EXISTS passes_validate_gym_references ON passes;
CREATE TRIGGER passes_validate_gym_references
  BEFORE INSERT OR UPDATE ON passes
  FOR EACH ROW EXECUTE FUNCTION validate_pass_gym_references();

DROP TRIGGER IF EXISTS sales_validate_gym_references ON sales;
CREATE TRIGGER sales_validate_gym_references
  BEFORE INSERT OR UPDATE ON sales
  FOR EACH ROW EXECUTE FUNCTION validate_sale_gym_references();

DROP TRIGGER IF EXISTS calendar_sessions_validate_gym_references ON calendar_sessions;
CREATE TRIGGER calendar_sessions_validate_gym_references
  BEFORE INSERT OR UPDATE ON calendar_sessions
  FOR EACH ROW EXECUTE FUNCTION validate_calendar_session_gym_references();

CREATE TABLE IF NOT EXISTS gym_invoice_counters (
  gym_id UUID PRIMARY KEY REFERENCES gyms(id) ON DELETE CASCADE,
  next_invoice_seq INTEGER NOT NULL CHECK (next_invoice_seq > 0),
  invoice_series TEXT NOT NULL DEFAULT 'FF',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO gym_invoice_counters (gym_id, next_invoice_seq, invoice_series)
SELECT g.id,
       GREATEST(COALESCE(MAX(s.invoice_seq), 1000) + 1, 1001),
       COALESCE(NULLIF(MAX(s.invoice_series), ''), 'FF')
  FROM gyms g
  LEFT JOIN sales s ON s.gym_id = g.id
 GROUP BY g.id
ON CONFLICT (gym_id) DO UPDATE
   SET next_invoice_seq = GREATEST(gym_invoice_counters.next_invoice_seq, EXCLUDED.next_invoice_seq),
       invoice_series = EXCLUDED.invoice_series,
       updated_at = NOW();

DROP TRIGGER IF EXISTS gym_invoice_counters_updated_at ON gym_invoice_counters;
CREATE TRIGGER gym_invoice_counters_updated_at
  BEFORE UPDATE ON gym_invoice_counters
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE FUNCTION build_invoice_code()
RETURNS TRIGGER AS $$
DECLARE
  v_counter gym_invoice_counters%ROWTYPE;
BEGIN
  IF NEW.gym_id IS NULL THEN
    RAISE EXCEPTION 'La venta debe tener gimnasio antes de generar factura';
  END IF;

  SELECT *
    INTO v_counter
    FROM gym_invoice_counters
   WHERE gym_id = NEW.gym_id
   FOR UPDATE;

  IF v_counter.gym_id IS NULL THEN
    INSERT INTO gym_invoice_counters (gym_id, next_invoice_seq, invoice_series)
    VALUES (NEW.gym_id, 1001, COALESCE(NULLIF(NEW.invoice_series, ''), 'FF'))
    RETURNING * INTO v_counter;
  END IF;

  IF NEW.invoice_seq IS NULL THEN
    NEW.invoice_seq := v_counter.next_invoice_seq;

    UPDATE gym_invoice_counters
       SET next_invoice_seq = v_counter.next_invoice_seq + 1,
           updated_at = NOW()
     WHERE gym_id = NEW.gym_id;
  END IF;

  IF NEW.invoice_series IS NULL OR NEW.invoice_series = '' THEN
    NEW.invoice_series := COALESCE(NULLIF(v_counter.invoice_series, ''), 'FF');
  END IF;

  IF NEW.invoice_code IS NULL OR NEW.invoice_code = '' THEN
    NEW.invoice_code := NEW.invoice_series || '-' || lpad(NEW.invoice_seq::text, 6, '0');
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

INSERT INTO audit_logs (gym_id, actor_profile_id, entity_name, entity_id, action, diff)
SELECT g.id,
       NULL,
       'gyms',
       g.id,
       'update',
       jsonb_build_object(
         'source', 'migration_032_multitenant_subdomains',
         'slug', g.slug,
         'assigned_existing_data', TRUE,
         'legacy_data_remaining', FALSE
       )
  FROM gyms g
 WHERE g.slug = 'eltemplo';

DROP FUNCTION IF EXISTS app_claim_client_portal_account(UUID, TEXT, TEXT);
CREATE OR REPLACE FUNCTION app_claim_client_portal_account(
  p_auth_user_id UUID,
  p_gym_id UUID,
  p_email TEXT,
  p_provider TEXT
) RETURNS JSONB AS $$
DECLARE
  v_client RECORD;
  v_exact_match_count INTEGER := 0;
  v_existing_account RECORD;
  v_account_for_user RECORD;
  v_portal_account_id UUID;
  v_email TEXT;
BEGIN
  v_email := trim(COALESCE(p_email, ''));

  IF p_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado';
  END IF;

  IF p_gym_id IS NULL THEN
    RAISE EXCEPTION 'Gimnasio no resuelto';
  END IF;

  IF v_email = '' THEN
    RAISE EXCEPTION 'El email autenticado es obligatorio';
  END IF;

  IF p_provider NOT IN ('password', 'google') THEN
    RAISE EXCEPTION 'Proveedor de acceso no valido';
  END IF;

  SELECT COUNT(*)
    INTO v_exact_match_count
  FROM clients
  WHERE gym_id = p_gym_id
    AND email = v_email;

  IF v_exact_match_count = 0 THEN
    RAISE EXCEPTION 'No existe ninguna ficha de cliente con este email. Pide al gimnasio que revise tu email en tu ficha antes de acceder al portal.';
  END IF;

  IF v_exact_match_count > 1 THEN
    RAISE EXCEPTION 'Hay varias fichas de cliente con este email. El equipo del gimnasio debe corregirlo antes de activar tu acceso al portal.';
  END IF;

  SELECT id, first_name, last_name, email
    INTO v_client
  FROM clients
  WHERE gym_id = p_gym_id
    AND email = v_email
  LIMIT 1;

  SELECT *
    INTO v_existing_account
  FROM client_portal_accounts
  WHERE gym_id = p_gym_id
    AND client_id = v_client.id;

  SELECT *
    INTO v_account_for_user
  FROM client_portal_accounts
  WHERE gym_id = p_gym_id
    AND auth_user_id = p_auth_user_id;

  IF v_account_for_user.id IS NOT NULL AND v_account_for_user.client_id <> v_client.id THEN
    RAISE EXCEPTION 'Esta cuenta autenticada ya esta enlazada a otro cliente del portal.';
  END IF;

  IF v_existing_account.id IS NULL THEN
    INSERT INTO client_portal_accounts (
      gym_id,
      client_id,
      auth_user_id,
      email,
      email_normalized,
      status,
      primary_provider,
      claimed_at
    )
    VALUES (
      p_gym_id,
      v_client.id,
      p_auth_user_id,
      v_email,
      lower(v_email),
      'claimed',
      p_provider,
      NOW()
    )
    RETURNING id INTO v_portal_account_id;

    INSERT INTO audit_logs (gym_id, actor_profile_id, entity_name, entity_id, action, diff)
    VALUES (
      p_gym_id,
      NULL,
      'client_portal_accounts',
      v_portal_account_id,
      'portal_claim',
      jsonb_build_object(
        'client_id', v_client.id,
        'auth_user_id', p_auth_user_id,
        'provider', p_provider,
        'email', v_email
      )
    );
  ELSE
    IF v_existing_account.auth_user_id <> p_auth_user_id THEN
      RAISE EXCEPTION 'Este acceso ya esta reclamado por otra cuenta. Contacta con el gimnasio para revisar tu acceso al portal.';
    END IF;

    IF v_existing_account.status <> 'claimed' THEN
      RAISE EXCEPTION 'El acceso al portal de este cliente esta desactivado. Contacta con el gimnasio.';
    END IF;

    v_portal_account_id := v_existing_account.id;
  END IF;

  RETURN jsonb_build_object(
    'portal_account_id', v_portal_account_id,
    'client_id', v_client.id,
    'gym_id', p_gym_id,
    'status', 'claimed'
  );
END;
$$ LANGUAGE plpgsql;

DROP FUNCTION IF EXISTS app_record_client_portal_login(UUID, TEXT);
CREATE OR REPLACE FUNCTION app_record_client_portal_login(
  p_auth_user_id UUID,
  p_gym_id UUID,
  p_provider TEXT
) RETURNS JSONB AS $$
DECLARE
  v_account RECORD;
BEGIN
  IF p_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado';
  END IF;

  IF p_gym_id IS NULL THEN
    RAISE EXCEPTION 'Gimnasio no resuelto';
  END IF;

  IF p_provider NOT IN ('password', 'google') THEN
    RAISE EXCEPTION 'Proveedor de acceso no valido';
  END IF;

  SELECT *
    INTO v_account
  FROM client_portal_accounts
  WHERE gym_id = p_gym_id
    AND auth_user_id = p_auth_user_id;

  IF v_account.id IS NULL THEN
    RAISE EXCEPTION 'No hay acceso al portal asociado a este usuario.';
  END IF;

  IF v_account.status <> 'claimed' THEN
    RAISE EXCEPTION 'El acceso al portal de este cliente esta desactivado. Contacta con el gimnasio.';
  END IF;

  UPDATE client_portal_accounts
     SET last_login_at = NOW(),
         updated_at = NOW()
   WHERE id = v_account.id
     AND gym_id = p_gym_id;

  INSERT INTO audit_logs (gym_id, actor_profile_id, entity_name, entity_id, action, diff)
  VALUES (
    p_gym_id,
    NULL,
    'client_portal_accounts',
    v_account.id,
    'portal_login',
    jsonb_build_object(
      'client_id', v_account.client_id,
      'auth_user_id', p_auth_user_id,
      'provider', p_provider
    )
  );

  RETURN jsonb_build_object(
    'portal_account_id', v_account.id,
    'client_id', v_account.client_id,
    'gym_id', p_gym_id,
    'last_login_at', NOW()
  );
END;
$$ LANGUAGE plpgsql;

DROP FUNCTION IF EXISTS app_ensure_client_nutrition_thread(UUID);
CREATE OR REPLACE FUNCTION app_ensure_client_nutrition_thread(
  p_auth_user_id UUID,
  p_gym_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_portal_account RECORD;
  v_profile_id UUID;
  v_thread RECORD;
BEGIN
  IF p_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado';
  END IF;

  IF p_gym_id IS NULL THEN
    RAISE EXCEPTION 'Gimnasio no resuelto';
  END IF;

  SELECT *
    INTO v_portal_account
  FROM client_portal_accounts
  WHERE gym_id = p_gym_id
    AND auth_user_id = p_auth_user_id;

  IF v_portal_account.id IS NULL THEN
    RAISE EXCEPTION 'No hay acceso al portal asociado a este usuario.';
  END IF;

  IF v_portal_account.status <> 'claimed' THEN
    RAISE EXCEPTION 'El acceso al portal de este cliente esta desactivado. Contacta con el gimnasio.';
  END IF;

  INSERT INTO client_nutrition_profiles (gym_id, client_id)
  VALUES (p_gym_id, v_portal_account.client_id)
  ON CONFLICT (gym_id, client_id) DO NOTHING;

  SELECT id
    INTO v_profile_id
  FROM client_nutrition_profiles
  WHERE gym_id = p_gym_id
    AND client_id = v_portal_account.client_id;

  SELECT *
    INTO v_thread
  FROM nutrition_threads
  WHERE gym_id = p_gym_id
    AND client_id = v_portal_account.client_id
    AND status = 'active'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_thread.id IS NULL THEN
    INSERT INTO nutrition_threads (
      gym_id,
      client_id,
      nutrition_profile_id,
      status,
      started_at,
      last_message_at
    )
    VALUES (
      p_gym_id,
      v_portal_account.client_id,
      v_profile_id,
      'active',
      NOW(),
      NULL
    )
    RETURNING *
      INTO v_thread;

    INSERT INTO nutrition_usage_events (
      gym_id,
      client_id,
      thread_id,
      event_type
    )
    VALUES (
      p_gym_id,
      v_portal_account.client_id,
      v_thread.id,
      'thread_initialized'
    );

    INSERT INTO audit_logs (gym_id, actor_profile_id, entity_name, entity_id, action, diff)
    VALUES (
      p_gym_id,
      NULL,
      'nutrition_threads',
      v_thread.id,
      'create',
      jsonb_build_object(
        'client_id', v_portal_account.client_id,
        'source', 'client_portal'
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'client_id', v_portal_account.client_id,
    'gym_id', p_gym_id,
    'nutrition_profile_id', v_profile_id,
    'thread_id', v_thread.id,
    'thread_status', v_thread.status
  );
END;
$$ LANGUAGE plpgsql;

DROP FUNCTION IF EXISTS app_get_client_nutrition_quota_status(UUID);
CREATE OR REPLACE FUNCTION app_get_client_nutrition_quota_status(
  p_auth_user_id UUID,
  p_gym_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_portal_account RECORD;
  v_daily_count INTEGER := 0;
  v_monthly_count INTEGER := 0;
  v_today DATE;
  v_current_month TEXT;
BEGIN
  IF p_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado';
  END IF;

  IF p_gym_id IS NULL THEN
    RAISE EXCEPTION 'Gimnasio no resuelto';
  END IF;

  SELECT *
    INTO v_portal_account
  FROM client_portal_accounts
  WHERE gym_id = p_gym_id
    AND auth_user_id = p_auth_user_id;

  IF v_portal_account.id IS NULL THEN
    RAISE EXCEPTION 'No hay acceso al portal asociado a este usuario.';
  END IF;

  IF v_portal_account.status <> 'claimed' THEN
    RAISE EXCEPTION 'El acceso al portal de este cliente esta desactivado. Contacta con el gimnasio.';
  END IF;

  v_today := (NOW() AT TIME ZONE 'Europe/Madrid')::date;
  v_current_month := to_char(NOW() AT TIME ZONE 'Europe/Madrid', 'YYYY-MM');

  SELECT COUNT(*)
    INTO v_daily_count
  FROM nutrition_usage_events
  WHERE gym_id = p_gym_id
    AND client_id = v_portal_account.client_id
    AND event_type = 'user_message'
    AND (created_at AT TIME ZONE 'Europe/Madrid')::date = v_today;

  SELECT COUNT(*)
    INTO v_monthly_count
  FROM nutrition_usage_events
  WHERE gym_id = p_gym_id
    AND client_id = v_portal_account.client_id
    AND event_type = 'user_message'
    AND to_char(created_at AT TIME ZONE 'Europe/Madrid', 'YYYY-MM') = v_current_month;

  RETURN jsonb_build_object(
    'daily_used', v_daily_count,
    'daily_limit', 20,
    'daily_remaining', GREATEST(20 - v_daily_count, 0),
    'monthly_used', v_monthly_count,
    'monthly_limit', 300,
    'monthly_remaining', GREATEST(300 - v_monthly_count, 0),
    'blocked', v_daily_count >= 20 OR v_monthly_count >= 300
  );
END;
$$ LANGUAGE plpgsql;

DROP FUNCTION IF EXISTS app_append_nutrition_message(UUID, TEXT, TEXT, TEXT, JSONB);
CREATE OR REPLACE FUNCTION app_append_nutrition_message(
  p_auth_user_id UUID,
  p_gym_id UUID,
  p_role TEXT,
  p_content TEXT,
  p_model_id TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS JSONB AS $$
DECLARE
  v_portal_account RECORD;
  v_ensure JSONB;
  v_thread_id UUID;
  v_message RECORD;
  v_event_type TEXT;
  v_daily_count INTEGER := 0;
  v_monthly_count INTEGER := 0;
  v_today DATE;
  v_current_month TEXT;
BEGIN
  IF p_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado';
  END IF;

  IF p_gym_id IS NULL THEN
    RAISE EXCEPTION 'Gimnasio no resuelto';
  END IF;

  IF p_role NOT IN ('user', 'assistant', 'system') THEN
    RAISE EXCEPTION 'Rol de mensaje no valido';
  END IF;

  IF length(trim(COALESCE(p_content, ''))) = 0 THEN
    RAISE EXCEPTION 'El mensaje no puede estar vacio';
  END IF;

  IF length(p_content) > 8000 THEN
    RAISE EXCEPTION 'El mensaje supera el limite permitido';
  END IF;

  SELECT *
    INTO v_portal_account
  FROM client_portal_accounts
  WHERE gym_id = p_gym_id
    AND auth_user_id = p_auth_user_id;

  IF v_portal_account.id IS NULL THEN
    RAISE EXCEPTION 'No hay acceso al portal asociado a este usuario.';
  END IF;

  IF v_portal_account.status <> 'claimed' THEN
    RAISE EXCEPTION 'El acceso al portal de este cliente esta desactivado. Contacta con el gimnasio.';
  END IF;

  v_today := (NOW() AT TIME ZONE 'Europe/Madrid')::date;
  v_current_month := to_char(NOW() AT TIME ZONE 'Europe/Madrid', 'YYYY-MM');

  IF p_role = 'user' THEN
    SELECT COUNT(*)
      INTO v_daily_count
    FROM nutrition_usage_events
    WHERE gym_id = p_gym_id
      AND client_id = v_portal_account.client_id
      AND event_type = 'user_message'
      AND (created_at AT TIME ZONE 'Europe/Madrid')::date = v_today;

    SELECT COUNT(*)
      INTO v_monthly_count
    FROM nutrition_usage_events
    WHERE gym_id = p_gym_id
      AND client_id = v_portal_account.client_id
      AND event_type = 'user_message'
      AND to_char(created_at AT TIME ZONE 'Europe/Madrid', 'YYYY-MM') = v_current_month;

    IF v_daily_count >= 20 THEN
      RAISE EXCEPTION 'Has alcanzado el limite diario de mensajes de nutricion.';
    END IF;

    IF v_monthly_count >= 300 THEN
      RAISE EXCEPTION 'Has alcanzado el limite mensual de mensajes de nutricion.';
    END IF;
  END IF;

  v_ensure := app_ensure_client_nutrition_thread(p_auth_user_id, p_gym_id);
  v_thread_id := (v_ensure ->> 'thread_id')::uuid;
  v_event_type := CASE
    WHEN p_role = 'assistant' THEN 'assistant_message'
    ELSE 'user_message'
  END;

  INSERT INTO nutrition_messages (
    gym_id,
    thread_id,
    client_id,
    role,
    content,
    model_id,
    metadata
  )
  VALUES (
    p_gym_id,
    v_thread_id,
    v_portal_account.client_id,
    p_role,
    trim(p_content),
    p_model_id,
    COALESCE(p_metadata, '{}'::jsonb)
  )
  RETURNING *
    INTO v_message;

  UPDATE nutrition_threads
     SET last_message_at = v_message.created_at,
         updated_at = NOW()
   WHERE id = v_thread_id
     AND gym_id = p_gym_id;

  INSERT INTO nutrition_usage_events (
    gym_id,
    client_id,
    thread_id,
    message_id,
    event_type,
    model_id
  )
  VALUES (
    p_gym_id,
    v_portal_account.client_id,
    v_thread_id,
    v_message.id,
    v_event_type,
    p_model_id
  );

  INSERT INTO audit_logs (gym_id, actor_profile_id, entity_name, entity_id, action, diff)
  VALUES (
    p_gym_id,
    NULL,
    'nutrition_messages',
    v_message.id,
    'create',
    jsonb_build_object(
      'client_id', v_portal_account.client_id,
      'thread_id', v_thread_id,
      'role', p_role,
      'source', 'client_portal'
    )
  );

  UPDATE client_nutrition_profiles
     SET onboarding_status = CASE
       WHEN p_role IN ('user', 'assistant') THEN 'active'
       ELSE onboarding_status
     END,
         updated_at = NOW()
   WHERE gym_id = p_gym_id
     AND client_id = v_portal_account.client_id;

  RETURN jsonb_build_object(
    'thread_id', v_thread_id,
    'quota', app_get_client_nutrition_quota_status(p_auth_user_id, p_gym_id),
    'message', jsonb_build_object(
      'id', v_message.id,
      'thread_id', v_message.thread_id,
      'client_id', v_message.client_id,
      'role', v_message.role,
      'content', v_message.content,
      'model_id', v_message.model_id,
      'metadata', v_message.metadata,
      'created_at', v_message.created_at
    )
  );
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION app_claim_client_portal_account(UUID, UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION app_record_client_portal_login(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION app_ensure_client_nutrition_thread(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION app_get_client_nutrition_quota_status(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION app_append_nutrition_message(UUID, UUID, TEXT, TEXT, TEXT, JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION app_actor_gym_id(p_actor_profile_id UUID)
RETURNS UUID AS $$
DECLARE
  v_gym_id UUID;
BEGIN
  SELECT gym_id INTO v_gym_id
    FROM profiles
   WHERE id = p_actor_profile_id
     AND is_active = TRUE;

  IF v_gym_id IS NULL THEN
    RAISE EXCEPTION 'Perfil operativo no encontrado';
  END IF;

  RETURN v_gym_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION app_upsert_client(
  p_actor_profile_id UUID,
  p_client_id UUID,
  p_first_name TEXT,
  p_last_name TEXT,
  p_email TEXT,
  p_phone TEXT,
  p_tax_id TEXT,
  p_notes TEXT,
  p_is_active BOOLEAN
) RETURNS UUID AS $$
DECLARE
  v_client_id UUID;
  v_gym_id UUID := app_actor_gym_id(p_actor_profile_id);
BEGIN
  IF NULLIF(btrim(COALESCE(p_first_name, '')), '') IS NULL THEN
    RAISE EXCEPTION 'El nombre del cliente es obligatorio';
  END IF;

  p_first_name := btrim(p_first_name);
  p_last_name := NULLIF(btrim(COALESCE(p_last_name, '')), '');

  IF p_client_id IS NULL THEN
    INSERT INTO clients (
      gym_id, first_name, last_name, email, phone, tax_id, notes, is_active
    )
    VALUES (
      v_gym_id, p_first_name, p_last_name, NULLIF(p_email, ''), NULLIF(p_phone, ''),
      NULLIF(p_tax_id, ''), NULLIF(p_notes, ''), COALESCE(p_is_active, TRUE)
    )
    RETURNING id INTO v_client_id;

    INSERT INTO audit_logs (gym_id, actor_profile_id, entity_name, entity_id, action, diff)
    VALUES (v_gym_id, p_actor_profile_id, 'clients', v_client_id, 'create', jsonb_build_object('first_name', p_first_name, 'last_name', p_last_name));
  ELSE
    UPDATE clients
       SET first_name = p_first_name,
           last_name = p_last_name,
           email = NULLIF(p_email, ''),
           phone = NULLIF(p_phone, ''),
           tax_id = NULLIF(p_tax_id, ''),
           notes = NULLIF(p_notes, ''),
           is_active = COALESCE(p_is_active, TRUE),
           updated_at = NOW()
     WHERE id = p_client_id
       AND gym_id = v_gym_id
     RETURNING id INTO v_client_id;

    IF v_client_id IS NULL THEN
      RAISE EXCEPTION 'Cliente no encontrado';
    END IF;

    INSERT INTO audit_logs (gym_id, actor_profile_id, entity_name, entity_id, action, diff)
    VALUES (v_gym_id, p_actor_profile_id, 'clients', v_client_id, 'update', jsonb_build_object('first_name', p_first_name, 'last_name', p_last_name));
  END IF;

  RETURN v_client_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION app_create_internal_notification(
  p_actor_profile_id UUID,
  p_client_id UUID,
  p_pass_id UUID,
  p_sale_id UUID,
  p_event_type TEXT,
  p_recipient TEXT,
  p_subject TEXT,
  p_body TEXT,
  p_payload JSONB
) RETURNS UUID AS $$
DECLARE
  v_notification_id UUID;
  v_gym_id UUID := app_actor_gym_id(p_actor_profile_id);
BEGIN
  IF p_event_type NOT IN ('renewal_confirmation', 'manual_note') THEN
    RAISE EXCEPTION 'Tipo de evento interno no valido';
  END IF;

  IF COALESCE(trim(COALESCE(p_body, '')), '') = '' THEN
    RAISE EXCEPTION 'El cuerpo de la notificacion es obligatorio';
  END IF;

  INSERT INTO notification_log (
    gym_id,
    client_id,
    pass_id,
    sale_id,
    channel,
    event_type,
    status,
    recipient,
    subject,
    body,
    payload,
    processed_at
  )
  VALUES (
    v_gym_id,
    p_client_id,
    p_pass_id,
    p_sale_id,
    'internal',
    p_event_type,
    'sent',
    NULLIF(trim(COALESCE(p_recipient, '')), ''),
    NULLIF(trim(COALESCE(p_subject, '')), ''),
    trim(p_body),
    p_payload,
    NOW()
  )
  RETURNING id INTO v_notification_id;

  INSERT INTO audit_logs (gym_id, actor_profile_id, entity_name, entity_id, action, diff)
  VALUES (
    v_gym_id,
    p_actor_profile_id,
    'notification_log',
    v_notification_id,
    'send_notification',
    jsonb_build_object('channel', 'internal', 'event_type', p_event_type)
  );

  RETURN v_notification_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION app_upsert_pass_type(
  p_actor_profile_id UUID,
  p_pass_type_id UUID,
  p_name TEXT,
  p_kind TEXT,
  p_sessions_total INTEGER,
  p_price_gross NUMERIC,
  p_vat_rate NUMERIC,
  p_shared_allowed BOOLEAN,
  p_is_active BOOLEAN,
  p_sort_order INTEGER
) RETURNS UUID AS $$
DECLARE
  v_pass_type_id UUID;
  v_gym_id UUID := app_actor_gym_id(p_actor_profile_id);
BEGIN
  IF p_kind NOT IN ('session', 'monthly') THEN
    RAISE EXCEPTION 'Tipo de bono no valido';
  END IF;

  IF p_kind = 'session' AND (p_sessions_total IS NULL OR p_sessions_total < 1 OR p_sessions_total > 30) THEN
    RAISE EXCEPTION 'Los bonos por sesiones deben tener entre 1 y 30 sesiones';
  END IF;

  IF p_kind = 'monthly' THEN
    p_sessions_total := NULL;
  END IF;

  IF p_pass_type_id IS NULL THEN
    INSERT INTO pass_types (
      gym_id, name, kind, sessions_total, price_gross, vat_rate, shared_allowed, is_active, sort_order
    )
    VALUES (
      v_gym_id, p_name, p_kind, p_sessions_total, p_price_gross, p_vat_rate,
      COALESCE(p_shared_allowed, TRUE), COALESCE(p_is_active, TRUE), COALESCE(p_sort_order, 0)
    )
    RETURNING id INTO v_pass_type_id;

    INSERT INTO audit_logs (gym_id, actor_profile_id, entity_name, entity_id, action, diff)
    VALUES (v_gym_id, p_actor_profile_id, 'pass_types', v_pass_type_id, 'create', jsonb_build_object('name', p_name, 'kind', p_kind, 'sessions_total', p_sessions_total));
  ELSE
    UPDATE pass_types
       SET name = p_name,
           kind = p_kind,
           sessions_total = p_sessions_total,
           price_gross = p_price_gross,
           vat_rate = p_vat_rate,
           shared_allowed = COALESCE(p_shared_allowed, TRUE),
           is_active = COALESCE(p_is_active, TRUE),
           sort_order = COALESCE(p_sort_order, 0),
           updated_at = NOW()
     WHERE id = p_pass_type_id
       AND gym_id = v_gym_id
     RETURNING id INTO v_pass_type_id;

    IF v_pass_type_id IS NULL THEN
      RAISE EXCEPTION 'Tipo de bono no encontrado';
    END IF;

    INSERT INTO audit_logs (gym_id, actor_profile_id, entity_name, entity_id, action, diff)
    VALUES (v_gym_id, p_actor_profile_id, 'pass_types', v_pass_type_id, 'update', jsonb_build_object('name', p_name, 'kind', p_kind, 'sessions_total', p_sessions_total));
  END IF;

  RETURN v_pass_type_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION app_upsert_product(
  p_actor_profile_id UUID,
  p_product_id UUID,
  p_name TEXT,
  p_sku TEXT,
  p_category TEXT,
  p_price_gross NUMERIC,
  p_vat_rate NUMERIC,
  p_min_stock INTEGER,
  p_is_active BOOLEAN
) RETURNS UUID AS $$
DECLARE
  v_product_id UUID;
  v_gym_id UUID := app_actor_gym_id(p_actor_profile_id);
BEGIN
  IF COALESCE(trim(p_name), '') = '' THEN
    RAISE EXCEPTION 'El nombre del producto es obligatorio';
  END IF;

  IF COALESCE(p_price_gross, -1) < 0 OR COALESCE(p_vat_rate, -1) < 0 OR COALESCE(p_min_stock, -1) < 0 THEN
    RAISE EXCEPTION 'Los importes y el stock minimo no pueden ser negativos';
  END IF;

  IF p_product_id IS NULL THEN
    INSERT INTO products (
      gym_id, name, sku, category, price_gross, vat_rate, min_stock, is_active
    )
    VALUES (
      v_gym_id, trim(p_name), NULLIF(trim(COALESCE(p_sku, '')), ''),
      NULLIF(trim(COALESCE(p_category, '')), ''), ROUND(p_price_gross::numeric, 2),
      ROUND(p_vat_rate::numeric, 2), p_min_stock, COALESCE(p_is_active, TRUE)
    )
    RETURNING id INTO v_product_id;

    INSERT INTO audit_logs (gym_id, actor_profile_id, entity_name, entity_id, action, diff)
    VALUES (v_gym_id, p_actor_profile_id, 'products', v_product_id, 'create', jsonb_build_object('name', trim(p_name), 'sku', NULLIF(trim(COALESCE(p_sku, '')), '')));
  ELSE
    UPDATE products
       SET name = trim(p_name),
           sku = NULLIF(trim(COALESCE(p_sku, '')), ''),
           category = NULLIF(trim(COALESCE(p_category, '')), ''),
           price_gross = ROUND(p_price_gross::numeric, 2),
           vat_rate = ROUND(p_vat_rate::numeric, 2),
           min_stock = p_min_stock,
           is_active = COALESCE(p_is_active, TRUE),
           updated_at = NOW()
     WHERE id = p_product_id
       AND gym_id = v_gym_id
     RETURNING id INTO v_product_id;

    IF v_product_id IS NULL THEN
      RAISE EXCEPTION 'Producto no encontrado';
    END IF;

    INSERT INTO audit_logs (gym_id, actor_profile_id, entity_name, entity_id, action, diff)
    VALUES (v_gym_id, p_actor_profile_id, 'products', v_product_id, 'update', jsonb_build_object('name', trim(p_name), 'sku', NULLIF(trim(COALESCE(p_sku, '')), '')));
  END IF;

  RETURN v_product_id;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION app_actor_gym_id(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION app_upsert_client(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION app_upsert_pass_type(UUID, UUID, TEXT, TEXT, INTEGER, NUMERIC, NUMERIC, BOOLEAN, BOOLEAN, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION app_upsert_product(UUID, UUID, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, INTEGER, BOOLEAN) TO authenticated;
