CREATE TABLE IF NOT EXISTS client_portal_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL UNIQUE REFERENCES clients(id),
  auth_user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  email_normalized TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'claimed' CHECK (status IN ('claimed', 'disabled')),
  primary_provider TEXT NOT NULL CHECK (primary_provider IN ('password', 'google')),
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_client_portal_accounts_email_normalized
  ON client_portal_accounts (email_normalized);

CREATE INDEX IF NOT EXISTS idx_client_portal_accounts_status
  ON client_portal_accounts (status);

CREATE INDEX IF NOT EXISTS idx_client_portal_accounts_last_login_at
  ON client_portal_accounts (last_login_at DESC);

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
      'portal_login'
    )
  );

DROP TRIGGER IF EXISTS client_portal_accounts_updated_at ON client_portal_accounts;
CREATE TRIGGER client_portal_accounts_updated_at
  BEFORE UPDATE ON client_portal_accounts
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE FUNCTION app_claim_client_portal_account(
  p_auth_user_id UUID,
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

  IF v_email = '' THEN
    RAISE EXCEPTION 'El email autenticado es obligatorio';
  END IF;

  IF p_provider NOT IN ('password', 'google') THEN
    RAISE EXCEPTION 'Proveedor de acceso no valido';
  END IF;

  SELECT COUNT(*)
    INTO v_exact_match_count
  FROM clients
  WHERE email = v_email;

  IF v_exact_match_count = 0 THEN
    RAISE EXCEPTION 'No existe ninguna ficha de cliente con este email. Pide al gimnasio que revise tu email en tu ficha antes de acceder al portal.';
  END IF;

  IF v_exact_match_count > 1 THEN
    RAISE EXCEPTION 'Hay varias fichas de cliente con este email. El equipo del gimnasio debe corregirlo antes de activar tu acceso al portal.';
  END IF;

  SELECT id, first_name, last_name, email
    INTO v_client
  FROM clients
  WHERE email = v_email
  LIMIT 1;

  SELECT *
    INTO v_existing_account
  FROM client_portal_accounts
  WHERE client_id = v_client.id;

  SELECT *
    INTO v_account_for_user
  FROM client_portal_accounts
  WHERE auth_user_id = p_auth_user_id;

  IF v_account_for_user.id IS NOT NULL AND v_account_for_user.client_id <> v_client.id THEN
    RAISE EXCEPTION 'Esta cuenta autenticada ya esta enlazada a otro cliente del portal.';
  END IF;

  IF v_existing_account.id IS NULL THEN
    INSERT INTO client_portal_accounts (
      client_id,
      auth_user_id,
      email,
      email_normalized,
      status,
      primary_provider,
      claimed_at
    )
    VALUES (
      v_client.id,
      p_auth_user_id,
      v_email,
      lower(v_email),
      'claimed',
      p_provider,
      NOW()
    )
    RETURNING id INTO v_portal_account_id;

    INSERT INTO audit_logs (actor_profile_id, entity_name, entity_id, action, diff)
    VALUES (
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
    'status', 'claimed'
  );
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION app_record_client_portal_login(
  p_auth_user_id UUID,
  p_provider TEXT
) RETURNS JSONB AS $$
DECLARE
  v_account RECORD;
BEGIN
  IF p_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado';
  END IF;

  IF p_provider NOT IN ('password', 'google') THEN
    RAISE EXCEPTION 'Proveedor de acceso no valido';
  END IF;

  SELECT *
    INTO v_account
  FROM client_portal_accounts
  WHERE auth_user_id = p_auth_user_id;

  IF v_account.id IS NULL THEN
    RAISE EXCEPTION 'No hay acceso al portal asociado a este usuario.';
  END IF;

  IF v_account.status <> 'claimed' THEN
    RAISE EXCEPTION 'El acceso al portal de este cliente esta desactivado. Contacta con el gimnasio.';
  END IF;

  UPDATE client_portal_accounts
     SET last_login_at = NOW(),
         updated_at = NOW()
   WHERE id = v_account.id;

  INSERT INTO audit_logs (actor_profile_id, entity_name, entity_id, action, diff)
  VALUES (
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
    'last_login_at', NOW()
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

GRANT EXECUTE ON FUNCTION app_claim_client_portal_account(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION app_record_client_portal_login(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION app_delete_client(UUID, UUID) TO authenticated;
