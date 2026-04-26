CREATE OR REPLACE FUNCTION app_upsert_calendar_session(
  p_actor_profile_id UUID,
  p_session_id UUID,
  p_trainer_profile_id UUID,
  p_client_1_id UUID,
  p_client_2_id UUID,
  p_pass_id UUID,
  p_starts_at TIMESTAMPTZ,
  p_ends_at TIMESTAMPTZ,
  p_status TEXT,
  p_notes TEXT
) RETURNS UUID AS $$
DECLARE
  v_session_id UUID;
BEGIN
  IF p_status NOT IN ('scheduled', 'completed', 'cancelled', 'no_show') THEN
    RAISE EXCEPTION 'Estado de sesión no válido';
  END IF;

  IF p_ends_at <= p_starts_at THEN
    RAISE EXCEPTION 'La sesión debe terminar después de empezar';
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
      p_client_1_id,
      p_client_2_id,
      p_pass_id,
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
        'starts_at', p_starts_at,
        'ends_at', p_ends_at,
        'status', p_status
      )
    );
  ELSE
    UPDATE calendar_sessions
       SET trainer_profile_id = p_trainer_profile_id,
           client_1_id = p_client_1_id,
           client_2_id = p_client_2_id,
           pass_id = p_pass_id,
           starts_at = p_starts_at,
           ends_at = p_ends_at,
           status = p_status,
           notes = NULLIF(trim(COALESCE(p_notes, '')), ''),
           updated_at = NOW()
     WHERE id = p_session_id
     RETURNING id INTO v_session_id;

    IF v_session_id IS NULL THEN
      RAISE EXCEPTION 'Sesión no encontrada';
    END IF;

    INSERT INTO audit_logs (actor_profile_id, entity_name, entity_id, action, diff)
    VALUES (
      p_actor_profile_id,
      'calendar_sessions',
      v_session_id,
      'update',
      jsonb_build_object(
        'trainer_profile_id', p_trainer_profile_id,
        'starts_at', p_starts_at,
        'ends_at', p_ends_at,
        'status', p_status
      )
    );
  END IF;

  RETURN v_session_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION app_delete_calendar_session(
  p_actor_profile_id UUID,
  p_session_id UUID
) RETURNS UUID AS $$
DECLARE
  v_session_id UUID;
BEGIN
  UPDATE calendar_sessions
     SET status = 'cancelled',
         updated_at = NOW()
   WHERE id = p_session_id
   RETURNING id INTO v_session_id;

  IF v_session_id IS NULL THEN
    RAISE EXCEPTION 'Sesión no encontrada';
  END IF;

  INSERT INTO audit_logs (actor_profile_id, entity_name, entity_id, action, diff)
  VALUES (
    p_actor_profile_id,
    'calendar_sessions',
    v_session_id,
    'delete',
    jsonb_build_object('status', 'cancelled')
  );

  RETURN v_session_id;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION app_upsert_calendar_session(UUID, UUID, UUID, UUID, UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION app_delete_calendar_session(UUID, UUID) TO authenticated;
