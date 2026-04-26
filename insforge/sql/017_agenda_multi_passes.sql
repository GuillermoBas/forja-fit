ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS calendar_color TEXT NOT NULL DEFAULT '#BFDBFE';

UPDATE profiles
   SET calendar_color = '#BFDBFE'
 WHERE calendar_color IS NULL OR calendar_color = '';

CREATE TABLE IF NOT EXISTS calendar_session_passes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES calendar_sessions(id) ON DELETE CASCADE,
  pass_id UUID NOT NULL REFERENCES passes(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (session_id, pass_id)
);

CREATE INDEX IF NOT EXISTS idx_calendar_session_passes_session_id ON calendar_session_passes (session_id);
CREATE INDEX IF NOT EXISTS idx_calendar_session_passes_pass_id ON calendar_session_passes (pass_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_calendar_sessions_unique_trainer_slot
  ON calendar_sessions (trainer_profile_id, starts_at, ends_at)
  WHERE status <> 'cancelled';

INSERT INTO calendar_session_passes (session_id, pass_id)
SELECT id, pass_id
  FROM calendar_sessions
 WHERE pass_id IS NOT NULL
ON CONFLICT (session_id, pass_id) DO NOTHING;

ALTER TABLE calendar_sessions
  DROP CONSTRAINT IF EXISTS calendar_sessions_no_overlap;

DROP FUNCTION IF EXISTS app_upsert_calendar_session(
  UUID,
  UUID,
  UUID,
  UUID,
  UUID,
  UUID,
  TIMESTAMPTZ,
  TIMESTAMPTZ,
  TEXT,
  TEXT
);

CREATE OR REPLACE FUNCTION app_upsert_calendar_session(
  p_actor_profile_id UUID,
  p_session_id UUID,
  p_trainer_profile_id UUID,
  p_pass_ids UUID[],
  p_starts_at TIMESTAMPTZ,
  p_ends_at TIMESTAMPTZ,
  p_status TEXT,
  p_notes TEXT
) RETURNS UUID AS $$
DECLARE
  v_session_id UUID;
  v_actor profiles%ROWTYPE;
  v_existing calendar_sessions%ROWTYPE;
  v_pass_count INTEGER := 0;
  v_client_ids UUID[];
  v_unique_pass_ids UUID[];
BEGIN
  SELECT * INTO v_actor
    FROM profiles
   WHERE id = p_actor_profile_id
     AND is_active = TRUE;

  IF v_actor.id IS NULL THEN
    RAISE EXCEPTION 'Perfil operativo no encontrado';
  END IF;

  IF v_actor.role <> 'admin' AND p_trainer_profile_id <> p_actor_profile_id THEN
    RAISE EXCEPTION 'Solo admin puede gestionar agendas de otros entrenadores';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM profiles
     WHERE id = p_trainer_profile_id
       AND is_active = TRUE
       AND role IN ('admin', 'trainer')
  ) THEN
    RAISE EXCEPTION 'Entrenador no valido';
  END IF;

  IF p_status NOT IN ('scheduled', 'completed', 'cancelled', 'no_show') THEN
    RAISE EXCEPTION 'Estado de sesion no valido';
  END IF;

  IF p_ends_at <= p_starts_at THEN
    RAISE EXCEPTION 'La sesion debe terminar despues de empezar';
  END IF;

  IF date_part('minute', p_starts_at) <> 0
     OR date_part('second', p_starts_at) <> 0
     OR date_part('minute', p_ends_at) <> 0
     OR date_part('second', p_ends_at) <> 0 THEN
    RAISE EXCEPTION 'La agenda solo permite horas completas';
  END IF;

  SELECT ARRAY(
    SELECT DISTINCT unnest(COALESCE(p_pass_ids, ARRAY[]::UUID[]))
  ) INTO v_unique_pass_ids;

  IF array_length(v_unique_pass_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'Selecciona al menos un bono';
  END IF;

  SELECT COUNT(*) INTO v_pass_count
    FROM passes
   WHERE id = ANY(v_unique_pass_ids)
     AND status = 'active';

  IF v_pass_count <> array_length(v_unique_pass_ids, 1) THEN
    RAISE EXCEPTION 'Todos los bonos seleccionados deben estar activos';
  END IF;

  SELECT ARRAY(
    SELECT DISTINCT ph.client_id
      FROM pass_holders ph
     WHERE ph.pass_id = ANY(v_unique_pass_ids)
     ORDER BY ph.client_id
  ) INTO v_client_ids;

  IF array_length(v_client_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'Los bonos seleccionados no tienen clientes titulares';
  END IF;

  IF p_session_id IS NOT NULL THEN
    SELECT * INTO v_existing
      FROM calendar_sessions
     WHERE id = p_session_id
     FOR UPDATE;

    IF v_existing.id IS NULL THEN
      RAISE EXCEPTION 'Sesion no encontrada';
    END IF;

    IF v_existing.status = 'completed' THEN
      RAISE EXCEPTION 'Una cita consumida queda en solo lectura';
    END IF;

    IF v_actor.role <> 'admin' AND v_existing.trainer_profile_id <> p_actor_profile_id THEN
      RAISE EXCEPTION 'No puedes modificar citas de otro entrenador';
    END IF;
  END IF;

  IF p_session_id IS NULL THEN
    INSERT INTO calendar_sessions (
      trainer_profile_id,
      client_1_id,
      client_2_id,
      pass_id,
      starts_at,
      ends_at,
      status,
      notes,
      created_by_profile_id
    )
    VALUES (
      p_trainer_profile_id,
      v_client_ids[1],
      CASE WHEN array_length(v_client_ids, 1) >= 2 THEN v_client_ids[2] ELSE NULL END,
      v_unique_pass_ids[1],
      p_starts_at,
      p_ends_at,
      p_status,
      NULLIF(trim(COALESCE(p_notes, '')), ''),
      p_actor_profile_id
    )
    RETURNING id INTO v_session_id;

    INSERT INTO audit_logs (actor_profile_id, entity_name, entity_id, action, diff)
    VALUES (
      p_actor_profile_id,
      'calendar_sessions',
      v_session_id,
      'create',
      jsonb_build_object(
        'trainer_profile_id', p_trainer_profile_id,
        'pass_ids', v_unique_pass_ids,
        'client_ids', v_client_ids,
        'starts_at', p_starts_at,
        'ends_at', p_ends_at,
        'status', p_status
      )
    );
  ELSE
    UPDATE calendar_sessions
       SET trainer_profile_id = p_trainer_profile_id,
           client_1_id = v_client_ids[1],
           client_2_id = CASE WHEN array_length(v_client_ids, 1) >= 2 THEN v_client_ids[2] ELSE NULL END,
           pass_id = v_unique_pass_ids[1],
           starts_at = p_starts_at,
           ends_at = p_ends_at,
           status = p_status,
           notes = NULLIF(trim(COALESCE(p_notes, '')), ''),
           updated_at = NOW()
     WHERE id = p_session_id
     RETURNING id INTO v_session_id;

    INSERT INTO audit_logs (actor_profile_id, entity_name, entity_id, action, diff)
    VALUES (
      p_actor_profile_id,
      'calendar_sessions',
      v_session_id,
      'update',
      jsonb_build_object(
        'trainer_profile_id', p_trainer_profile_id,
        'pass_ids', v_unique_pass_ids,
        'client_ids', v_client_ids,
        'starts_at', p_starts_at,
        'ends_at', p_ends_at,
        'status', p_status
      )
    );
  END IF;

  DELETE FROM calendar_session_passes
   WHERE session_id = v_session_id;

  INSERT INTO calendar_session_passes (session_id, pass_id)
  SELECT v_session_id, unnest(v_unique_pass_ids);

  RETURN v_session_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION app_delete_calendar_session(
  p_actor_profile_id UUID,
  p_session_id UUID
) RETURNS UUID AS $$
DECLARE
  v_session calendar_sessions%ROWTYPE;
  v_actor profiles%ROWTYPE;
BEGIN
  SELECT * INTO v_actor
    FROM profiles
   WHERE id = p_actor_profile_id
     AND is_active = TRUE;

  IF v_actor.id IS NULL THEN
    RAISE EXCEPTION 'Perfil operativo no encontrado';
  END IF;

  SELECT * INTO v_session
    FROM calendar_sessions
   WHERE id = p_session_id
   FOR UPDATE;

  IF v_session.id IS NULL THEN
    RAISE EXCEPTION 'Sesion no encontrada';
  END IF;

  IF v_session.status = 'completed' THEN
    RAISE EXCEPTION 'Una cita consumida queda en solo lectura';
  END IF;

  IF v_actor.role <> 'admin' AND v_session.trainer_profile_id <> p_actor_profile_id THEN
    RAISE EXCEPTION 'No puedes eliminar citas de otro entrenador';
  END IF;

  UPDATE calendar_sessions
     SET status = 'cancelled',
         updated_at = NOW()
   WHERE id = p_session_id;

  INSERT INTO audit_logs (actor_profile_id, entity_name, entity_id, action, diff)
  VALUES (
    p_actor_profile_id,
    'calendar_sessions',
    p_session_id,
    'delete',
    jsonb_build_object('status', 'cancelled')
  );

  RETURN p_session_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION app_update_profile_calendar_color(
  p_actor_profile_id UUID,
  p_target_profile_id UUID,
  p_calendar_color TEXT
) RETURNS UUID AS $$
DECLARE
  v_actor profiles%ROWTYPE;
  v_palette TEXT[] := ARRAY[
    '#BFDBFE', '#BAE6FD', '#A7F3D0', '#BBF7D0', '#FEF3C7',
    '#FED7AA', '#FECACA', '#FBCFE8', '#E9D5FF', '#DDD6FE',
    '#C7D2FE', '#CCFBF1', '#D9F99D', '#FDE68A', '#FDBA74',
    '#FCA5A5', '#F5D0FE', '#E0E7FF', '#CFFAFE', '#E2E8F0'
  ];
BEGIN
  SELECT * INTO v_actor
    FROM profiles
   WHERE id = p_actor_profile_id
     AND is_active = TRUE;

  IF v_actor.id IS NULL THEN
    RAISE EXCEPTION 'Perfil operativo no encontrado';
  END IF;

  IF v_actor.role <> 'admin' AND p_target_profile_id <> p_actor_profile_id THEN
    RAISE EXCEPTION 'Solo admin puede cambiar el color de otros perfiles';
  END IF;

  IF NOT (p_calendar_color = ANY(v_palette)) THEN
    RAISE EXCEPTION 'Color de agenda no valido';
  END IF;

  UPDATE profiles
     SET calendar_color = p_calendar_color,
         updated_at = NOW()
   WHERE id = p_target_profile_id
     AND is_active = TRUE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Perfil no encontrado';
  END IF;

  INSERT INTO audit_logs (actor_profile_id, entity_name, entity_id, action, diff)
  VALUES (
    p_actor_profile_id,
    'profiles',
    p_target_profile_id,
    'update',
    jsonb_build_object('calendar_color', p_calendar_color)
  );

  RETURN p_target_profile_id;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION app_upsert_calendar_session(UUID, UUID, UUID, UUID[], TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION app_delete_calendar_session(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION app_update_profile_calendar_color(UUID, UUID, TEXT) TO authenticated;
