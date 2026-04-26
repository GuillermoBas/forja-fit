ALTER TABLE pass_types
  ADD COLUMN IF NOT EXISTS kind TEXT;

UPDATE pass_types
SET kind = 'session'
WHERE kind IS NULL;

ALTER TABLE pass_types
  ALTER COLUMN kind SET NOT NULL,
  ALTER COLUMN kind SET DEFAULT 'session';

ALTER TABLE pass_types
  DROP CONSTRAINT IF EXISTS pass_types_kind_check,
  DROP CONSTRAINT IF EXISTS pass_types_sessions_total_check;

ALTER TABLE pass_types
  ALTER COLUMN sessions_total DROP NOT NULL;

ALTER TABLE pass_types
  ADD CONSTRAINT pass_types_kind_check
    CHECK (kind IN ('session', 'monthly')),
  ADD CONSTRAINT pass_types_sessions_total_check
    CHECK (
      (kind = 'session' AND sessions_total BETWEEN 1 AND 30)
      OR
      (kind = 'monthly' AND sessions_total IS NULL)
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

INSERT INTO pass_holders (pass_id, client_id, holder_order)
SELECT id, holder_1_client_id, 1
FROM passes
WHERE holder_1_client_id IS NOT NULL
ON CONFLICT (pass_id, client_id) DO NOTHING;

INSERT INTO pass_holders (pass_id, client_id, holder_order)
SELECT id, holder_2_client_id, 2
FROM passes
WHERE holder_2_client_id IS NOT NULL
ON CONFLICT (pass_id, client_id) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_pass_holders_client_id ON pass_holders (client_id);
CREATE INDEX IF NOT EXISTS idx_pass_holders_pass_id_order ON pass_holders (pass_id, holder_order);

ALTER TABLE passes
  DROP CONSTRAINT IF EXISTS passes_check,
  DROP CONSTRAINT IF EXISTS passes_expiry_floor_check,
  DROP CONSTRAINT IF EXISTS passes_holder_2_client_id_check,
  DROP CONSTRAINT IF EXISTS passes_original_sessions_check,
  DROP CONSTRAINT IF EXISTS passes_sessions_left_check;

ALTER TABLE passes
  ALTER COLUMN original_sessions DROP NOT NULL,
  ALTER COLUMN sessions_left DROP NOT NULL;

ALTER TABLE passes
  ADD CONSTRAINT passes_expiry_floor_check
    CHECK (expires_on >= contracted_on),
  ADD CONSTRAINT passes_sessions_nullable_check
    CHECK (
      (original_sessions IS NULL AND sessions_left IS NULL)
      OR
      (original_sessions BETWEEN 1 AND 30 AND sessions_left BETWEEN 0 AND original_sessions)
    );

DROP TRIGGER IF EXISTS trg_validate_session_consumption_client ON session_consumptions;
DROP TRIGGER IF EXISTS trg_consume_pass_session ON session_consumptions;
DROP FUNCTION IF EXISTS validate_session_consumption_client();
DROP FUNCTION IF EXISTS consume_pass_session();

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

CREATE TRIGGER trg_validate_session_consumption_client
  BEFORE INSERT ON session_consumptions
  FOR EACH ROW
  EXECUTE FUNCTION validate_session_consumption_client();

CREATE TRIGGER trg_consume_pass_session
  AFTER INSERT ON session_consumptions
  FOR EACH ROW
  EXECUTE FUNCTION consume_pass_session();

ALTER TABLE passes
  DROP COLUMN IF EXISTS holder_1_client_id,
  DROP COLUMN IF EXISTS holder_2_client_id;
