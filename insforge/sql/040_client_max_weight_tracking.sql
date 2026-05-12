CREATE TABLE IF NOT EXISTS strength_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (btrim(name) <> ''),
  unit TEXT NOT NULL DEFAULT 'kg' CHECK (btrim(unit) <> ''),
  display_order INTEGER NOT NULL DEFAULT 0 CHECK (display_order >= 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS strength_metrics_gym_active_name_key
  ON strength_metrics (gym_id, lower(name))
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_strength_metrics_gym_active_order
  ON strength_metrics (gym_id, is_active, display_order, name);

CREATE TABLE IF NOT EXISTS client_max_weight_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  metric_id UUID NOT NULL REFERENCES strength_metrics(id),
  value_kg NUMERIC(8,1) NOT NULL CHECK (value_kg >= 0),
  entry_date DATE NOT NULL,
  created_by_profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_client_max_weight_entries_client_date
  ON client_max_weight_entries (gym_id, client_id, entry_date DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_client_max_weight_entries_metric_date
  ON client_max_weight_entries (gym_id, client_id, metric_id, entry_date DESC, created_at DESC);

DROP TRIGGER IF EXISTS strength_metrics_updated_at ON strength_metrics;
CREATE TRIGGER strength_metrics_updated_at
  BEFORE UPDATE ON strength_metrics
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS client_max_weight_entries_updated_at ON client_max_weight_entries;
CREATE TRIGGER client_max_weight_entries_updated_at
  BEFORE UPDATE ON client_max_weight_entries
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE FUNCTION validate_client_max_weight_entry_gym_references()
RETURNS TRIGGER AS $$
DECLARE
  v_client_gym_id UUID;
  v_metric_gym_id UUID;
  v_profile_gym_id UUID;
BEGIN
  SELECT gym_id INTO v_client_gym_id FROM clients WHERE id = NEW.client_id;
  SELECT gym_id INTO v_metric_gym_id FROM strength_metrics WHERE id = NEW.metric_id;

  PERFORM app_require_same_gym(NEW.gym_id, v_client_gym_id, 'El cliente no pertenece al gimnasio del registro de fuerza');
  PERFORM app_require_same_gym(NEW.gym_id, v_metric_gym_id, 'La metrica no pertenece al gimnasio del registro de fuerza');

  IF NEW.created_by_profile_id IS NOT NULL THEN
    SELECT gym_id INTO v_profile_gym_id FROM profiles WHERE id = NEW.created_by_profile_id;
    PERFORM app_require_same_gym(NEW.gym_id, v_profile_gym_id, 'El perfil creador no pertenece al gimnasio del registro de fuerza');
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS validate_client_max_weight_entry_gym_references ON client_max_weight_entries;
CREATE TRIGGER validate_client_max_weight_entry_gym_references
  BEFORE INSERT OR UPDATE ON client_max_weight_entries
  FOR EACH ROW
  EXECUTE FUNCTION validate_client_max_weight_entry_gym_references();

INSERT INTO strength_metrics (gym_id, name, unit, display_order, is_active)
SELECT gyms.id, seed.name, 'kg', seed.display_order, TRUE
FROM gyms
CROSS JOIN (
  VALUES
    ('Pecho', 1),
    ('Espalda', 2),
    ('Pierna', 3)
) AS seed(name, display_order)
WHERE NOT EXISTS (
  SELECT 1
  FROM strength_metrics existing
  WHERE existing.gym_id = gyms.id
    AND lower(existing.name) = lower(seed.name)
);

CREATE OR REPLACE FUNCTION app_require_staff_actor(
  p_actor_profile_id UUID
) RETURNS profiles AS $$
DECLARE
  v_profile profiles%ROWTYPE;
BEGIN
  SELECT *
    INTO v_profile
  FROM profiles
  WHERE id = p_actor_profile_id
    AND is_active = TRUE;

  IF v_profile.id IS NULL THEN
    RAISE EXCEPTION 'Perfil operativo no encontrado';
  END IF;

  IF v_profile.role NOT IN ('admin', 'trainer') THEN
    RAISE EXCEPTION 'Solo staff puede realizar esta accion';
  END IF;

  RETURN v_profile;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION app_upsert_strength_metric(
  p_actor_profile_id UUID,
  p_metric_id UUID,
  p_name TEXT,
  p_unit TEXT,
  p_is_active BOOLEAN,
  p_display_order INTEGER
) RETURNS UUID AS $$
DECLARE
  v_actor profiles%ROWTYPE;
  v_metric_id UUID;
  v_name TEXT := btrim(COALESCE(p_name, ''));
  v_unit TEXT := btrim(COALESCE(NULLIF(p_unit, ''), 'kg'));
  v_is_active BOOLEAN := COALESCE(p_is_active, TRUE);
  v_display_order INTEGER := COALESCE(p_display_order, 0);
BEGIN
  v_actor := app_require_staff_actor(p_actor_profile_id);

  IF v_actor.role <> 'admin' THEN
    RAISE EXCEPTION 'Solo admin puede gestionar metricas de fuerza';
  END IF;

  IF v_name = '' THEN
    RAISE EXCEPTION 'El nombre de la metrica es obligatorio';
  END IF;

  IF v_unit = '' THEN
    RAISE EXCEPTION 'La unidad de la metrica es obligatoria';
  END IF;

  IF v_display_order < 0 THEN
    RAISE EXCEPTION 'El orden de la metrica no puede ser negativo';
  END IF;

  IF v_is_active AND EXISTS (
    SELECT 1
    FROM strength_metrics
    WHERE gym_id = v_actor.gym_id
      AND is_active = TRUE
      AND lower(name) = lower(v_name)
      AND (p_metric_id IS NULL OR id <> p_metric_id)
  ) THEN
    RAISE EXCEPTION 'Ya existe una metrica activa con ese nombre';
  END IF;

  IF p_metric_id IS NULL THEN
    INSERT INTO strength_metrics (
      gym_id,
      name,
      unit,
      is_active,
      display_order
    )
    VALUES (
      v_actor.gym_id,
      v_name,
      v_unit,
      v_is_active,
      v_display_order
    )
    RETURNING id INTO v_metric_id;

    INSERT INTO audit_logs (gym_id, actor_profile_id, entity_name, entity_id, action, diff)
    VALUES (
      v_actor.gym_id,
      p_actor_profile_id,
      'strength_metrics',
      v_metric_id,
      'create',
      jsonb_build_object('name', v_name, 'unit', v_unit, 'is_active', v_is_active, 'display_order', v_display_order)
    );
  ELSE
    UPDATE strength_metrics
       SET name = v_name,
           unit = v_unit,
           is_active = v_is_active,
           display_order = v_display_order,
           updated_at = NOW()
     WHERE id = p_metric_id
       AND gym_id = v_actor.gym_id
     RETURNING id INTO v_metric_id;

    IF v_metric_id IS NULL THEN
      RAISE EXCEPTION 'Metrica de fuerza no encontrada';
    END IF;

    INSERT INTO audit_logs (gym_id, actor_profile_id, entity_name, entity_id, action, diff)
    VALUES (
      v_actor.gym_id,
      p_actor_profile_id,
      'strength_metrics',
      v_metric_id,
      'update',
      jsonb_build_object('name', v_name, 'unit', v_unit, 'is_active', v_is_active, 'display_order', v_display_order)
    );
  END IF;

  RETURN v_metric_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION app_record_client_max_weight_entries(
  p_actor_profile_id UUID,
  p_client_id UUID,
  p_entry_date DATE,
  p_entries JSONB
) RETURNS JSONB AS $$
DECLARE
  v_actor profiles%ROWTYPE;
  v_client_id UUID;
  v_entry JSONB;
  v_metric strength_metrics%ROWTYPE;
  v_value_text TEXT;
  v_value NUMERIC;
  v_notes TEXT;
  v_inserted client_max_weight_entries%ROWTYPE;
  v_created JSONB := '[]'::jsonb;
BEGIN
  v_actor := app_require_staff_actor(p_actor_profile_id);

  IF p_client_id IS NULL THEN
    RAISE EXCEPTION 'El cliente es obligatorio';
  END IF;

  IF p_entry_date IS NULL THEN
    RAISE EXCEPTION 'La fecha del registro es obligatoria';
  END IF;

  SELECT id
    INTO v_client_id
  FROM clients
  WHERE id = p_client_id
    AND gym_id = v_actor.gym_id;

  IF v_client_id IS NULL THEN
    RAISE EXCEPTION 'Cliente no encontrado';
  END IF;

  IF jsonb_typeof(COALESCE(p_entries, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'Los registros de fuerza deben enviarse como una lista';
  END IF;

  FOR v_entry IN SELECT * FROM jsonb_array_elements(COALESCE(p_entries, '[]'::jsonb))
  LOOP
    v_value_text := NULLIF(btrim(COALESCE(v_entry ->> 'valueKg', '')), '');

    IF v_value_text IS NULL THEN
      CONTINUE;
    END IF;

    SELECT *
      INTO v_metric
    FROM strength_metrics
    WHERE id = NULLIF(v_entry ->> 'metricId', '')::uuid
      AND gym_id = v_actor.gym_id
      AND is_active = TRUE;

    IF v_metric.id IS NULL THEN
      RAISE EXCEPTION 'Metrica de fuerza no valida o inactiva';
    END IF;

    v_value := v_value_text::numeric;

    IF v_value < 0 THEN
      RAISE EXCEPTION 'El peso no puede ser negativo';
    END IF;

    IF v_value <> trunc(v_value * 10) / 10 THEN
      RAISE EXCEPTION 'El peso solo puede tener un decimal';
    END IF;

    v_notes := NULLIF(btrim(COALESCE(v_entry ->> 'notes', '')), '');

    INSERT INTO client_max_weight_entries (
      gym_id,
      client_id,
      metric_id,
      value_kg,
      entry_date,
      created_by_profile_id,
      notes
    )
    VALUES (
      v_actor.gym_id,
      p_client_id,
      v_metric.id,
      v_value,
      p_entry_date,
      p_actor_profile_id,
      v_notes
    )
    RETURNING * INTO v_inserted;

    INSERT INTO audit_logs (gym_id, actor_profile_id, entity_name, entity_id, action, diff)
    VALUES (
      v_actor.gym_id,
      p_actor_profile_id,
      'client_max_weight_entries',
      v_inserted.id,
      'create',
      jsonb_build_object(
        'client_id', p_client_id,
        'metric_id', v_metric.id,
        'value_kg', v_value,
        'entry_date', p_entry_date
      )
    );

    v_created := v_created || jsonb_build_array(jsonb_build_object(
      'id', v_inserted.id,
      'client_id', v_inserted.client_id,
      'metric_id', v_inserted.metric_id,
      'value_kg', v_inserted.value_kg,
      'entry_date', v_inserted.entry_date
    ));
  END LOOP;

  RETURN jsonb_build_object('entries', v_created);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION app_update_client_max_weight_entry(
  p_actor_profile_id UUID,
  p_entry_id UUID,
  p_value_kg NUMERIC,
  p_entry_date DATE,
  p_notes TEXT
) RETURNS UUID AS $$
DECLARE
  v_actor profiles%ROWTYPE;
  v_entry client_max_weight_entries%ROWTYPE;
  v_notes TEXT := NULLIF(btrim(COALESCE(p_notes, '')), '');
BEGIN
  v_actor := app_require_staff_actor(p_actor_profile_id);

  IF p_entry_id IS NULL THEN
    RAISE EXCEPTION 'El registro de fuerza es obligatorio';
  END IF;

  IF p_entry_date IS NULL THEN
    RAISE EXCEPTION 'La fecha del registro es obligatoria';
  END IF;

  IF p_value_kg IS NULL THEN
    RAISE EXCEPTION 'El peso es obligatorio';
  END IF;

  IF p_value_kg < 0 THEN
    RAISE EXCEPTION 'El peso no puede ser negativo';
  END IF;

  IF p_value_kg <> trunc(p_value_kg * 10) / 10 THEN
    RAISE EXCEPTION 'El peso solo puede tener un decimal';
  END IF;

  UPDATE client_max_weight_entries
     SET value_kg = p_value_kg,
         entry_date = p_entry_date,
         notes = v_notes,
         updated_at = NOW()
   WHERE id = p_entry_id
     AND gym_id = v_actor.gym_id
   RETURNING * INTO v_entry;

  IF v_entry.id IS NULL THEN
    RAISE EXCEPTION 'Registro de fuerza no encontrado';
  END IF;

  INSERT INTO audit_logs (gym_id, actor_profile_id, entity_name, entity_id, action, diff)
  VALUES (
    v_actor.gym_id,
    p_actor_profile_id,
    'client_max_weight_entries',
    v_entry.id,
    'update',
    jsonb_build_object(
      'client_id', v_entry.client_id,
      'metric_id', v_entry.metric_id,
      'value_kg', p_value_kg,
      'entry_date', p_entry_date
    )
  );

  RETURN v_entry.id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION app_delete_client_max_weight_entry(
  p_actor_profile_id UUID,
  p_entry_id UUID
) RETURNS UUID AS $$
DECLARE
  v_actor profiles%ROWTYPE;
  v_entry client_max_weight_entries%ROWTYPE;
BEGIN
  v_actor := app_require_staff_actor(p_actor_profile_id);

  IF p_entry_id IS NULL THEN
    RAISE EXCEPTION 'El registro de fuerza es obligatorio';
  END IF;

  SELECT *
    INTO v_entry
  FROM client_max_weight_entries
  WHERE id = p_entry_id
    AND gym_id = v_actor.gym_id;

  IF v_entry.id IS NULL THEN
    RAISE EXCEPTION 'Registro de fuerza no encontrado';
  END IF;

  DELETE FROM client_max_weight_entries
  WHERE id = p_entry_id
    AND gym_id = v_actor.gym_id;

  INSERT INTO audit_logs (gym_id, actor_profile_id, entity_name, entity_id, action, diff)
  VALUES (
    v_actor.gym_id,
    p_actor_profile_id,
    'client_max_weight_entries',
    v_entry.id,
    'delete',
    jsonb_build_object(
      'client_id', v_entry.client_id,
      'metric_id', v_entry.metric_id,
      'value_kg', v_entry.value_kg,
      'entry_date', v_entry.entry_date
    )
  );

  RETURN p_entry_id;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION app_require_staff_actor(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION app_upsert_strength_metric(UUID, UUID, TEXT, TEXT, BOOLEAN, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION app_record_client_max_weight_entries(UUID, UUID, DATE, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION app_update_client_max_weight_entry(UUID, UUID, NUMERIC, DATE, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION app_delete_client_max_weight_entry(UUID, UUID) TO authenticated;
