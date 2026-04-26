CREATE TABLE IF NOT EXISTS client_nutrition_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL UNIQUE REFERENCES clients(id) ON DELETE CASCADE,
  onboarding_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (onboarding_status IN ('pending', 'active')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS nutrition_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  nutrition_profile_id UUID NOT NULL REFERENCES client_nutrition_profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'archived')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS nutrition_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES nutrition_threads(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  model_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS nutrition_usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  thread_id UUID REFERENCES nutrition_threads(id) ON DELETE SET NULL,
  message_id UUID REFERENCES nutrition_messages(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL
    CHECK (event_type IN ('thread_initialized', 'user_message', 'assistant_message')),
  model_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nutrition_threads_client_id
  ON nutrition_threads (client_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_nutrition_threads_active_client
  ON nutrition_threads (client_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_nutrition_messages_thread_created_at
  ON nutrition_messages (thread_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_nutrition_messages_client_created_at
  ON nutrition_messages (client_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_nutrition_usage_events_client_created_at
  ON nutrition_usage_events (client_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_nutrition_usage_events_thread_created_at
  ON nutrition_usage_events (thread_id, created_at DESC);

DROP TRIGGER IF EXISTS client_nutrition_profiles_updated_at ON client_nutrition_profiles;
CREATE TRIGGER client_nutrition_profiles_updated_at
  BEFORE UPDATE ON client_nutrition_profiles
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS nutrition_threads_updated_at ON nutrition_threads;
CREATE TRIGGER nutrition_threads_updated_at
  BEFORE UPDATE ON nutrition_threads
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS nutrition_messages_updated_at ON nutrition_messages;
CREATE TRIGGER nutrition_messages_updated_at
  BEFORE UPDATE ON nutrition_messages
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS nutrition_usage_events_updated_at ON nutrition_usage_events;
CREATE TRIGGER nutrition_usage_events_updated_at
  BEFORE UPDATE ON nutrition_usage_events
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE FUNCTION app_ensure_client_nutrition_thread(
  p_auth_user_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_portal_account RECORD;
  v_profile_id UUID;
  v_thread RECORD;
BEGIN
  IF p_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado';
  END IF;

  SELECT *
    INTO v_portal_account
  FROM client_portal_accounts
  WHERE auth_user_id = p_auth_user_id;

  IF v_portal_account.id IS NULL THEN
    RAISE EXCEPTION 'No hay acceso al portal asociado a este usuario.';
  END IF;

  IF v_portal_account.status <> 'claimed' THEN
    RAISE EXCEPTION 'El acceso al portal de este cliente esta desactivado. Contacta con el gimnasio.';
  END IF;

  INSERT INTO client_nutrition_profiles (client_id)
  VALUES (v_portal_account.client_id)
  ON CONFLICT (client_id) DO NOTHING;

  SELECT id
    INTO v_profile_id
  FROM client_nutrition_profiles
  WHERE client_id = v_portal_account.client_id;

  SELECT *
    INTO v_thread
  FROM nutrition_threads
  WHERE client_id = v_portal_account.client_id
    AND status = 'active'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_thread.id IS NULL THEN
    INSERT INTO nutrition_threads (
      client_id,
      nutrition_profile_id,
      status,
      started_at,
      last_message_at
    )
    VALUES (
      v_portal_account.client_id,
      v_profile_id,
      'active',
      NOW(),
      NULL
    )
    RETURNING *
      INTO v_thread;

    INSERT INTO nutrition_usage_events (
      client_id,
      thread_id,
      event_type
    )
    VALUES (
      v_portal_account.client_id,
      v_thread.id,
      'thread_initialized'
    );

    INSERT INTO audit_logs (actor_profile_id, entity_name, entity_id, action, diff)
    VALUES (
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
    'nutrition_profile_id', v_profile_id,
    'thread_id', v_thread.id,
    'thread_status', v_thread.status
  );
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION app_append_nutrition_message(
  p_auth_user_id UUID,
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
BEGIN
  IF p_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado';
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
  WHERE auth_user_id = p_auth_user_id;

  IF v_portal_account.id IS NULL THEN
    RAISE EXCEPTION 'No hay acceso al portal asociado a este usuario.';
  END IF;

  IF v_portal_account.status <> 'claimed' THEN
    RAISE EXCEPTION 'El acceso al portal de este cliente esta desactivado. Contacta con el gimnasio.';
  END IF;

  v_ensure := app_ensure_client_nutrition_thread(p_auth_user_id);
  v_thread_id := (v_ensure ->> 'thread_id')::uuid;
  v_event_type := CASE
    WHEN p_role = 'assistant' THEN 'assistant_message'
    ELSE 'user_message'
  END;

  INSERT INTO nutrition_messages (
    thread_id,
    client_id,
    role,
    content,
    model_id,
    metadata
  )
  VALUES (
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
   WHERE id = v_thread_id;

  INSERT INTO nutrition_usage_events (
    client_id,
    thread_id,
    message_id,
    event_type,
    model_id
  )
  VALUES (
    v_portal_account.client_id,
    v_thread_id,
    v_message.id,
    v_event_type,
    p_model_id
  );

  INSERT INTO audit_logs (actor_profile_id, entity_name, entity_id, action, diff)
  VALUES (
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
   WHERE client_id = v_portal_account.client_id;

  RETURN jsonb_build_object(
    'thread_id', v_thread_id,
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

CREATE OR REPLACE FUNCTION app_delete_client(
  p_actor_profile_id UUID,
  p_client_id UUID
) RETURNS UUID AS $$
DECLARE
  v_client clients%ROWTYPE;
  v_pass_count INTEGER := 0;
  v_sale_count INTEGER := 0;
  v_notification_count INTEGER := 0;
  v_calendar_count INTEGER := 0;
  v_portal_account_count INTEGER := 0;
  v_nutrition_profile_count INTEGER := 0;
  v_nutrition_thread_count INTEGER := 0;
  v_nutrition_message_count INTEGER := 0;
BEGIN
  SELECT *
    INTO v_client
  FROM clients
  WHERE id = p_client_id;

  IF v_client.id IS NULL THEN
    RAISE EXCEPTION 'Cliente no encontrado';
  END IF;

  SELECT COUNT(*)
    INTO v_pass_count
  FROM passes p
  LEFT JOIN pass_holders ph ON ph.pass_id = p.id
  WHERE ph.client_id = p_client_id
     OR p.purchased_by_client_id = p_client_id;

  IF v_pass_count > 0 THEN
    RAISE EXCEPTION 'No se puede borrar el cliente porque tiene bonos asociados';
  END IF;

  SELECT COUNT(*)
    INTO v_sale_count
  FROM sales
  WHERE client_id = p_client_id;

  IF v_sale_count > 0 THEN
    RAISE EXCEPTION 'No se puede borrar el cliente porque tiene ventas asociadas';
  END IF;

  SELECT COUNT(*)
    INTO v_notification_count
  FROM notification_log
  WHERE client_id = p_client_id;

  IF v_notification_count > 0 THEN
    RAISE EXCEPTION 'No se puede borrar el cliente porque tiene notificaciones asociadas';
  END IF;

  SELECT COUNT(*)
    INTO v_calendar_count
  FROM calendar_sessions
  WHERE client_1_id = p_client_id
     OR client_2_id = p_client_id;

  IF v_calendar_count > 0 THEN
    RAISE EXCEPTION 'No se puede borrar el cliente porque tiene sesiones de agenda asociadas';
  END IF;

  SELECT COUNT(*)
    INTO v_portal_account_count
  FROM client_portal_accounts
  WHERE client_id = p_client_id;

  IF v_portal_account_count > 0 THEN
    RAISE EXCEPTION 'No se puede borrar el cliente porque tiene acceso al portal asociado';
  END IF;

  SELECT COUNT(*)
    INTO v_nutrition_profile_count
  FROM client_nutrition_profiles
  WHERE client_id = p_client_id;

  SELECT COUNT(*)
    INTO v_nutrition_thread_count
  FROM nutrition_threads
  WHERE client_id = p_client_id;

  SELECT COUNT(*)
    INTO v_nutrition_message_count
  FROM nutrition_messages
  WHERE client_id = p_client_id;

  IF v_nutrition_profile_count > 0
     OR v_nutrition_thread_count > 0
     OR v_nutrition_message_count > 0 THEN
    RAISE EXCEPTION 'No se puede borrar el cliente porque tiene historial nutricional asociado';
  END IF;

  DELETE FROM clients
  WHERE id = p_client_id;

  INSERT INTO audit_logs (actor_profile_id, entity_name, entity_id, action, diff)
  VALUES (
    p_actor_profile_id,
    'clients',
    p_client_id,
    'delete',
    jsonb_build_object(
      'first_name', v_client.first_name,
      'last_name', v_client.last_name,
      'email', v_client.email
    )
  );

  RETURN p_client_id;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION app_ensure_client_nutrition_thread(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION app_append_nutrition_message(UUID, TEXT, TEXT, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION app_delete_client(UUID, UUID) TO authenticated;
