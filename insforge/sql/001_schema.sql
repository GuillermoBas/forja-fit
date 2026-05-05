CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE SEQUENCE IF NOT EXISTS invoice_seq_global START 1001;

CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'trainer')),
  calendar_color TEXT NOT NULL DEFAULT '#BFDBFE',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name TEXT NOT NULL,
  reminder_days_default INTEGER NOT NULL DEFAULT 7 CHECK (reminder_days_default BETWEEN 0 AND 30),
  default_vat_rate NUMERIC(5,2) NOT NULL DEFAULT 21 CHECK (default_vat_rate >= 0),
  brand_asset_version TEXT,
  brand_assets JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name TEXT NOT NULL,
  last_name TEXT,
  email TEXT,
  phone TEXT,
  tax_id TEXT,
  notes TEXT,
  joined_on DATE NOT NULL DEFAULT CURRENT_DATE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pass_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL DEFAULT 'session' CHECK (kind IN ('session', 'monthly')),
  sessions_total INTEGER,
  price_gross NUMERIC(10,2) NOT NULL CHECK (price_gross >= 0),
  vat_rate NUMERIC(5,2) NOT NULL CHECK (vat_rate >= 0),
  shared_allowed BOOLEAN NOT NULL DEFAULT TRUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (kind = 'session' AND sessions_total BETWEEN 1 AND 30)
    OR
    (kind = 'monthly' AND sessions_total IS NULL)
  )
);

CREATE TABLE IF NOT EXISTS passes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pass_type_id UUID NOT NULL REFERENCES pass_types(id),
  purchased_by_client_id UUID REFERENCES clients(id),
  renewed_from_pass_id UUID REFERENCES passes(id),
  contracted_on DATE NOT NULL,
  expires_on DATE NOT NULL,
  pass_sub_type TEXT CHECK (pass_sub_type IN ('individual', 'shared_2', 'shared_3')),
  sold_price_gross NUMERIC(10,2) NOT NULL CHECK (sold_price_gross >= 0),
  status TEXT NOT NULL CHECK (status IN ('active', 'paused', 'out_of_sessions', 'expired', 'cancelled')),
  original_sessions INTEGER,
  sessions_left INTEGER,
  notes TEXT,
  created_by_profile_id UUID NOT NULL REFERENCES profiles(id),
  last_consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (expires_on >= contracted_on),
  CHECK (
    (original_sessions IS NULL AND sessions_left IS NULL)
    OR
    (original_sessions BETWEEN 1 AND 30 AND sessions_left BETWEEN 0 AND original_sessions)
  )
);

CREATE TABLE IF NOT EXISTS pass_holders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pass_id UUID NOT NULL REFERENCES passes(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id),
  holder_order INTEGER NOT NULL CHECK (holder_order BETWEEN 1 AND 5),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (pass_id, client_id),
  UNIQUE (pass_id, holder_order)
);

CREATE TABLE IF NOT EXISTS pass_pauses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pass_id UUID NOT NULL REFERENCES passes(id) ON DELETE CASCADE,
  starts_on DATE NOT NULL,
  ends_on DATE NOT NULL,
  pause_days INTEGER NOT NULL CHECK (pause_days BETWEEN 1 AND 7),
  reason TEXT,
  approved_by_profile_id UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (ends_on >= starts_on),
  CHECK (((ends_on - starts_on) + 1) = pause_days)
);

CREATE TABLE IF NOT EXISTS session_consumptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pass_id UUID NOT NULL REFERENCES passes(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id),
  consumed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  recorded_by_profile_id UUID NOT NULL REFERENCES profiles(id),
  notes TEXT
);

CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  sku TEXT UNIQUE,
  category TEXT,
  price_gross NUMERIC(10,2) NOT NULL CHECK (price_gross >= 0),
  vat_rate NUMERIC(5,2) NOT NULL CHECK (vat_rate >= 0),
  stock_on_hand INTEGER NOT NULL DEFAULT 0 CHECK (stock_on_hand >= 0),
  min_stock INTEGER NOT NULL DEFAULT 0 CHECK (min_stock >= 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sold_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  client_id UUID REFERENCES clients(id),
  handled_by_profile_id UUID NOT NULL REFERENCES profiles(id),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'card', 'transfer', 'bizum')),
  status TEXT NOT NULL CHECK (status IN ('posted', 'void')),
  subtotal_net NUMERIC(10,2) NOT NULL CHECK (subtotal_net >= 0),
  vat_total NUMERIC(10,2) NOT NULL CHECK (vat_total >= 0),
  total_gross NUMERIC(10,2) NOT NULL CHECK (total_gross >= 0),
  invoice_series TEXT NOT NULL,
  invoice_seq INTEGER NOT NULL,
  invoice_code TEXT NOT NULL UNIQUE,
  fiscal_name TEXT,
  fiscal_tax_id TEXT,
  ticket_storage_key TEXT,
  ticket_public_url TEXT,
  internal_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (invoice_series, invoice_seq)
);

CREATE TABLE IF NOT EXISTS sale_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL CHECK (item_type IN ('pass', 'product')),
  product_id UUID REFERENCES products(id),
  pass_id UUID REFERENCES passes(id),
  description_snapshot TEXT NOT NULL,
  qty INTEGER NOT NULL CHECK (qty > 0),
  unit_price_gross NUMERIC(10,2) NOT NULL CHECK (unit_price_gross >= 0),
  vat_rate NUMERIC(5,2) NOT NULL CHECK (vat_rate >= 0),
  line_total_gross NUMERIC(10,2) NOT NULL CHECK (line_total_gross >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (item_type = 'product' AND product_id IS NOT NULL AND pass_id IS NULL)
    OR
    (item_type = 'pass' AND pass_id IS NOT NULL AND product_id IS NULL)
  )
);

CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  spent_on DATE NOT NULL,
  category TEXT NOT NULL,
  supplier TEXT,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'card', 'transfer', 'bizum')),
  base_amount NUMERIC(10,2) NOT NULL CHECK (base_amount >= 0),
  vat_amount NUMERIC(10,2) NOT NULL CHECK (vat_amount >= 0),
  total_amount NUMERIC(10,2) NOT NULL CHECK (total_amount >= 0),
  note TEXT,
  created_by_profile_id UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS calendar_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_profile_id UUID NOT NULL REFERENCES profiles(id),
  client_1_id UUID NOT NULL REFERENCES clients(id),
  client_2_id UUID REFERENCES clients(id),
  pass_id UUID REFERENCES passes(id),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('scheduled', 'completed', 'cancelled', 'no_show')),
  notes TEXT,
  created_by_profile_id UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (ends_at > starts_at),
  CHECK (client_2_id IS NULL OR client_1_id <> client_2_id)
);

CREATE TABLE IF NOT EXISTS calendar_session_passes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES calendar_sessions(id) ON DELETE CASCADE,
  pass_id UUID NOT NULL REFERENCES passes(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (session_id, pass_id)
);

CREATE TABLE IF NOT EXISTS notification_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id),
  pass_id UUID REFERENCES passes(id),
  sale_id UUID REFERENCES sales(id),
  channel TEXT NOT NULL CHECK (channel IN ('internal', 'email', 'push')),
  event_type TEXT NOT NULL CHECK (
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
  ),
  status TEXT NOT NULL CHECK (status IN ('queued', 'sent', 'failed', 'skipped')),
  recipient TEXT,
  subject TEXT,
  body TEXT,
  payload JSONB,
  dedupe_key TEXT,
  processed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_profile_id UUID REFERENCES profiles(id),
  entity_name TEXT NOT NULL,
  entity_id UUID,
  action TEXT NOT NULL CHECK (
    action IN (
      'create',
      'update',
      'delete',
      'renew',
      'consume',
      'pause',
      'void_sale',
      'send_notification',
      'login'
    )
  ),
  diff JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS job_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_key TEXT NOT NULL,
  run_for_date DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('started', 'completed', 'failed')),
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (job_key, run_for_date)
);

CREATE INDEX IF NOT EXISTS idx_clients_last_name_first_name ON clients (last_name, first_name);
CREATE INDEX IF NOT EXISTS idx_passes_expires_on ON passes (expires_on);
CREATE INDEX IF NOT EXISTS idx_passes_status ON passes (status);
CREATE INDEX IF NOT EXISTS idx_pass_holders_client_id ON pass_holders (client_id);
CREATE INDEX IF NOT EXISTS idx_pass_holders_pass_id_order ON pass_holders (pass_id, holder_order);
CREATE INDEX IF NOT EXISTS idx_session_consumptions_pass_id ON session_consumptions (pass_id, consumed_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_sold_at ON sales (sold_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_log_created_at ON notification_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_log_event_type_status ON notification_log (event_type, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_log_dedupe_key_unique
  ON notification_log (dedupe_key)
  WHERE dedupe_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_calendar_sessions_trainer_date ON calendar_sessions (trainer_profile_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_calendar_session_passes_session_id ON calendar_session_passes (session_id);
CREATE INDEX IF NOT EXISTS idx_calendar_session_passes_pass_id ON calendar_session_passes (pass_id);
CREATE INDEX IF NOT EXISTS idx_expenses_spent_on ON expenses (spent_on DESC);
CREATE INDEX IF NOT EXISTS idx_products_stock_on_hand ON products (stock_on_hand);

ALTER TABLE calendar_sessions
  DROP CONSTRAINT IF EXISTS calendar_sessions_no_overlap;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION calculate_pass_expiry(
  p_kind TEXT,
  p_contracted_on DATE
) RETURNS DATE AS $$
BEGIN
  IF p_kind = 'monthly' THEN
    RETURN (date_trunc('month', p_contracted_on::timestamp) + INTERVAL '1 month' - INTERVAL '1 day')::date;
  END IF;

  RETURN p_contracted_on + 30;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION validate_session_consumption_client()
RETURNS TRIGGER AS $$
DECLARE
  v_status TEXT;
  v_sessions_left INTEGER;
  v_pass_kind TEXT;
  v_is_holder BOOLEAN := FALSE;
BEGIN
  SELECT p.status, p.sessions_left, pt.kind
    INTO v_status, v_sessions_left, v_pass_kind
  FROM passes p
  JOIN pass_types pt ON pt.id = p.pass_type_id
  WHERE p.id = NEW.pass_id;

  IF v_pass_kind IS NULL THEN
    RAISE EXCEPTION 'Bono no encontrado';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM pass_holders
    WHERE pass_id = NEW.pass_id
      AND client_id = NEW.client_id
  )
  INTO v_is_holder;

  IF NOT v_is_holder THEN
    RAISE EXCEPTION 'El cliente no pertenece a este bono';
  END IF;

  IF v_status IN ('expired', 'cancelled') THEN
    RAISE EXCEPTION 'No se pueden consumir sesiones de un bono inactivo';
  END IF;

  IF v_pass_kind = 'monthly' THEN
    RAISE EXCEPTION 'Los bonos mensuales no consumen sesiones';
  END IF;

  IF COALESCE(v_sessions_left, 0) <= 0 THEN
    RAISE EXCEPTION 'El bono no tiene sesiones disponibles';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION consume_pass_session()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE passes p
     SET sessions_left = p.sessions_left - 1,
         last_consumed_at = NEW.consumed_at,
         status = CASE
           WHEN p.sessions_left - 1 <= 0 THEN 'out_of_sessions'
           WHEN p.status = 'paused' THEN 'active'
           ELSE p.status
         END,
         updated_at = NOW()
  FROM pass_types pt
   WHERE p.id = NEW.pass_id
     AND pt.id = p.pass_type_id
     AND pt.kind = 'session'
     AND p.sessions_left > 0;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se pudo consumir la sesion';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION validate_pass_pause()
RETURNS TRIGGER AS $$
DECLARE
  existing_pause_count INTEGER;
  v_status TEXT;
BEGIN
  SELECT status
    INTO v_status
  FROM passes
  WHERE id = NEW.pass_id;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Bono no encontrado';
  END IF;

  IF v_status IN ('expired', 'cancelled') THEN
    RAISE EXCEPTION 'No se puede pausar un bono inactivo';
  END IF;

  SELECT COUNT(*)
    INTO existing_pause_count
  FROM pass_pauses
  WHERE pass_id = NEW.pass_id
    AND date_trunc('month', starts_on)::date = date_trunc('month', NEW.starts_on)::date;

  IF existing_pause_count > 0 THEN
    RAISE EXCEPTION 'Solo se permite una pausa por mes';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION apply_pass_pause_dates()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE passes
     SET status = 'paused',
         expires_on = expires_on + NEW.pause_days,
         updated_at = NOW()
   WHERE id = NEW.pass_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION build_invoice_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.invoice_seq IS NULL THEN
    NEW.invoice_seq := nextval('invoice_seq_global');
  END IF;

  IF NEW.invoice_series IS NULL OR NEW.invoice_series = '' THEN
    NEW.invoice_series := 'FF';
  END IF;

  IF NEW.invoice_code IS NULL OR NEW.invoice_code = '' THEN
    NEW.invoice_code := NEW.invoice_series || '-' || lpad(NEW.invoice_seq::text, 6, '0');
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION attach_updated_at_trigger(table_name TEXT)
RETURNS VOID AS $$
BEGIN
  EXECUTE format(
    'DROP TRIGGER IF EXISTS %I_updated_at ON %I;
     CREATE TRIGGER %I_updated_at BEFORE UPDATE ON %I
     FOR EACH ROW EXECUTE FUNCTION set_updated_at();',
    table_name, table_name, table_name, table_name
  );
END;
$$ LANGUAGE plpgsql;

SELECT attach_updated_at_trigger('profiles');
SELECT attach_updated_at_trigger('settings');
SELECT attach_updated_at_trigger('clients');
SELECT attach_updated_at_trigger('pass_types');
SELECT attach_updated_at_trigger('passes');
SELECT attach_updated_at_trigger('products');
SELECT attach_updated_at_trigger('sales');
SELECT attach_updated_at_trigger('expenses');
SELECT attach_updated_at_trigger('calendar_sessions');
SELECT attach_updated_at_trigger('job_runs');

DROP FUNCTION attach_updated_at_trigger(TEXT);

DROP TRIGGER IF EXISTS trg_validate_session_consumption_client ON session_consumptions;
CREATE TRIGGER trg_validate_session_consumption_client
  BEFORE INSERT ON session_consumptions
  FOR EACH ROW
  EXECUTE FUNCTION validate_session_consumption_client();

DROP TRIGGER IF EXISTS trg_consume_pass_session ON session_consumptions;
CREATE TRIGGER trg_consume_pass_session
  AFTER INSERT ON session_consumptions
  FOR EACH ROW
  EXECUTE FUNCTION consume_pass_session();

DROP TRIGGER IF EXISTS trg_validate_pass_pause ON pass_pauses;
CREATE TRIGGER trg_validate_pass_pause
  BEFORE INSERT ON pass_pauses
  FOR EACH ROW
  EXECUTE FUNCTION validate_pass_pause();

DROP TRIGGER IF EXISTS trg_apply_pass_pause_dates ON pass_pauses;
CREATE TRIGGER trg_apply_pass_pause_dates
  AFTER INSERT ON pass_pauses
  FOR EACH ROW
  EXECUTE FUNCTION apply_pass_pause_dates();

DROP TRIGGER IF EXISTS trg_build_invoice_code ON sales;
CREATE TRIGGER trg_build_invoice_code
  BEFORE INSERT ON sales
  FOR EACH ROW
  EXECUTE FUNCTION build_invoice_code();
