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
  v_slot_session calendar_sessions%ROWTYPE;
  v_pass_count INTEGER := 0;
  v_client_ids UUID[];
  v_unique_pass_ids UUID[];
  v_merged_pass_ids UUID[];
  v_merged_client_ids UUID[];
  v_target_notes TEXT;
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

  IF array_length(v_client_ids, 1) > 5 THEN
    RAISE EXCEPTION 'Una franja solo puede agrupar hasta 5 clientes';
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

  SELECT * INTO v_slot_session
    FROM calendar_sessions
   WHERE trainer_profile_id = p_trainer_profile_id
     AND starts_at = p_starts_at
     AND ends_at = p_ends_at
     AND status <> 'cancelled'
     AND (p_session_id IS NULL OR id <> p_session_id)
   FOR UPDATE;

  IF v_slot_session.id IS NOT NULL AND v_slot_session.status = 'completed' THEN
    RAISE EXCEPTION 'Una cita consumida queda en solo lectura';
  END IF;

  IF p_session_id IS NULL AND v_slot_session.id IS NULL THEN
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
  ELSIF p_session_id IS NOT NULL AND v_slot_session.id IS NULL THEN
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
  ELSE
    v_session_id := COALESCE(v_slot_session.id, v_existing.id);

    SELECT ARRAY(
      SELECT DISTINCT pass_id
      FROM (
        SELECT unnest(COALESCE(v_unique_pass_ids, ARRAY[]::UUID[])) AS pass_id
        UNION
        SELECT csp.pass_id
        FROM calendar_session_passes csp
        WHERE csp.session_id = v_session_id
        UNION
        SELECT pass_id
        FROM calendar_sessions
        WHERE id = v_session_id
          AND pass_id IS NOT NULL
      ) merged_passes
      ORDER BY pass_id
    ) INTO v_merged_pass_ids;

    SELECT ARRAY(
      SELECT DISTINCT ph.client_id
      FROM pass_holders ph
      WHERE ph.pass_id = ANY(COALESCE(v_merged_pass_ids, ARRAY[]::UUID[]))
      ORDER BY ph.client_id
    ) INTO v_merged_client_ids;

    IF array_length(v_merged_client_ids, 1) IS NULL THEN
      RAISE EXCEPTION 'Los bonos seleccionados no tienen clientes titulares';
    END IF;

    IF array_length(v_merged_client_ids, 1) > 5 THEN
      RAISE EXCEPTION 'Una franja solo puede agrupar hasta 5 clientes';
    END IF;

    v_target_notes := NULLIF(trim(COALESCE(p_notes, '')), '');
    IF v_target_notes IS NULL THEN
      v_target_notes := NULLIF(trim(COALESCE(v_slot_session.notes, v_existing.notes, '')), '');
    END IF;

    UPDATE calendar_sessions
       SET trainer_profile_id = p_trainer_profile_id,
           client_1_id = v_merged_client_ids[1],
           client_2_id = CASE WHEN array_length(v_merged_client_ids, 1) >= 2 THEN v_merged_client_ids[2] ELSE NULL END,
           pass_id = v_merged_pass_ids[1],
           starts_at = p_starts_at,
           ends_at = p_ends_at,
           status = p_status,
           notes = v_target_notes,
           updated_at = NOW()
     WHERE id = v_session_id;

    DELETE FROM calendar_session_passes
     WHERE session_id = v_session_id;

    INSERT INTO calendar_session_passes (session_id, pass_id)
    SELECT v_session_id, unnest(v_merged_pass_ids);

    IF p_session_id IS NOT NULL AND v_slot_session.id IS NOT NULL THEN
      DELETE FROM calendar_session_passes
       WHERE session_id = p_session_id;

      DELETE FROM calendar_sessions
       WHERE id = p_session_id;
    END IF;

    INSERT INTO audit_logs (actor_profile_id, entity_name, entity_id, action, diff)
    VALUES (
      p_actor_profile_id,
      'calendar_sessions',
      v_session_id,
      'update',
      jsonb_build_object(
        'trainer_profile_id', p_trainer_profile_id,
        'pass_ids', v_merged_pass_ids,
        'client_ids', v_merged_client_ids,
        'starts_at', p_starts_at,
        'ends_at', p_ends_at,
        'status', p_status,
        'merged', TRUE,
        'merged_with_session_id', v_slot_session.id
      )
    );

    RETURN v_session_id;
  END IF;

  DELETE FROM calendar_session_passes
   WHERE session_id = v_session_id;

  INSERT INTO calendar_session_passes (session_id, pass_id)
  SELECT v_session_id, unnest(v_unique_pass_ids);

  RETURN v_session_id;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION app_upsert_calendar_session(UUID, UUID, UUID, UUID[], TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT) TO authenticated;
