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

  IF length(p_content) > 16000 THEN
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

GRANT EXECUTE ON FUNCTION app_append_nutrition_message(UUID, UUID, TEXT, TEXT, TEXT, JSONB) TO authenticated;
