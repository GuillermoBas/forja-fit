CREATE OR REPLACE FUNCTION app_manually_activate_client_portal_account(
  p_actor_profile_id UUID,
  p_gym_id UUID,
  p_client_id UUID,
  p_password_hash TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_actor profiles%ROWTYPE;
  v_client clients%ROWTYPE;
  v_client_name TEXT;
  v_email_normalized TEXT;
  v_duplicate_count INTEGER;
  v_auth_user_id UUID;
  v_auth_action TEXT := 'updated';
  v_existing_account client_portal_accounts%ROWTYPE;
  v_conflicting_account client_portal_accounts%ROWTYPE;
  v_linked_account client_portal_accounts%ROWTYPE;
  v_staff_profile profiles%ROWTYPE;
  v_portal_account_id UUID;
  v_account_action TEXT := 'update';
BEGIN
  IF p_gym_id IS NULL OR p_client_id IS NULL OR p_actor_profile_id IS NULL THEN
    RAISE EXCEPTION 'Faltan datos obligatorios para activar el portal.';
  END IF;

  IF p_password_hash IS NULL OR p_password_hash !~ '^\$2[aby]\$' THEN
    RAISE EXCEPTION 'La contraseña no se pudo preparar correctamente.';
  END IF;

  SELECT *
    INTO v_actor
  FROM profiles
  WHERE id = p_actor_profile_id
    AND gym_id = p_gym_id
    AND role = 'admin'
    AND is_active = TRUE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solo admin puede activar manualmente el portal cliente.';
  END IF;

  SELECT *
    INTO v_client
  FROM clients
  WHERE id = p_client_id
    AND gym_id = p_gym_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cliente no encontrado en este gimnasio.';
  END IF;

  v_email_normalized := lower(trim(coalesce(v_client.email, '')));

  IF v_email_normalized = '' THEN
    RAISE EXCEPTION 'El cliente no tiene email en su ficha.';
  END IF;

  SELECT COUNT(*)
    INTO v_duplicate_count
  FROM clients
  WHERE gym_id = p_gym_id
    AND lower(trim(coalesce(email, ''))) = v_email_normalized;

  IF v_duplicate_count > 1 THEN
    RAISE EXCEPTION 'Este email aparece en varios clientes del gimnasio. Corrigelo antes de activar el acceso.';
  END IF;

  v_client_name := trim(concat(coalesce(v_client.first_name, ''), ' ', coalesce(v_client.last_name, '')));

  SELECT *
    INTO v_existing_account
  FROM client_portal_accounts
  WHERE gym_id = p_gym_id
    AND client_id = p_client_id
  LIMIT 1;

  SELECT *
    INTO v_conflicting_account
  FROM client_portal_accounts
  WHERE gym_id = p_gym_id
    AND email_normalized = v_email_normalized
    AND client_id <> p_client_id
  LIMIT 1;

  IF v_conflicting_account.id IS NOT NULL THEN
    RAISE EXCEPTION 'Este email ya esta vinculado a otra cuenta de portal de este gimnasio.';
  END IF;

  SELECT id
    INTO v_auth_user_id
  FROM auth.users
  WHERE lower(email) = v_email_normalized
  LIMIT 1;

  IF v_auth_user_id IS NOT NULL THEN
    SELECT *
      INTO v_staff_profile
    FROM profiles
    WHERE auth_user_id = v_auth_user_id
    LIMIT 1;

    IF v_staff_profile.id IS NOT NULL THEN
      RAISE EXCEPTION 'Este email ya pertenece a una cuenta de personal. Usa recuperacion de contrasena para esa cuenta.';
    END IF;

    SELECT *
      INTO v_linked_account
    FROM client_portal_accounts
    WHERE auth_user_id = v_auth_user_id
      AND (gym_id <> p_gym_id OR client_id <> p_client_id)
    LIMIT 1;

    IF v_linked_account.id IS NOT NULL THEN
      RAISE EXCEPTION 'Este usuario ya esta vinculado a otro portal cliente. Debe usar su acceso actual o recuperar contrasena.';
    END IF;

    IF v_existing_account.id IS NOT NULL
       AND v_existing_account.auth_user_id <> v_auth_user_id
       AND EXISTS (
         SELECT 1
         FROM client_portal_accounts
         WHERE auth_user_id = v_existing_account.auth_user_id
           AND (gym_id <> p_gym_id OR client_id <> p_client_id)
       ) THEN
      RAISE EXCEPTION 'La cuenta de portal actual no se puede reasignar automaticamente.';
    END IF;

    UPDATE auth.users
    SET password = p_password_hash,
        email_verified = TRUE,
        profile = coalesce(profile, '{}'::jsonb) || jsonb_build_object('name', v_client_name),
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
          'source', 'manual_client_portal_activation',
          'gym_id', p_gym_id,
          'client_id', p_client_id
        ),
        updated_at = now()
    WHERE id = v_auth_user_id;
  ELSE
    INSERT INTO auth.users (
      email,
      password,
      email_verified,
      profile,
      metadata,
      is_project_admin,
      is_anonymous
    )
    VALUES (
      v_email_normalized,
      p_password_hash,
      TRUE,
      jsonb_build_object('name', v_client_name),
      jsonb_build_object(
        'source', 'manual_client_portal_activation',
        'gym_id', p_gym_id,
        'client_id', p_client_id
      ),
      FALSE,
      FALSE
    )
    RETURNING id INTO v_auth_user_id;

    v_auth_action := 'created';
  END IF;

  SELECT *
    INTO v_conflicting_account
  FROM client_portal_accounts
  WHERE gym_id = p_gym_id
    AND auth_user_id = v_auth_user_id
    AND client_id <> p_client_id
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'Este usuario de Auth ya esta vinculado a otro cliente de este gimnasio.';
  END IF;

  IF v_existing_account.id IS NOT NULL THEN
    UPDATE client_portal_accounts
    SET auth_user_id = v_auth_user_id,
        email = v_email_normalized,
        email_normalized = v_email_normalized,
        status = 'claimed',
        primary_provider = 'password',
        claimed_at = coalesce(claimed_at, now()),
        updated_at = now()
    WHERE id = v_existing_account.id
    RETURNING id INTO v_portal_account_id;
  ELSE
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
      p_client_id,
      v_auth_user_id,
      v_email_normalized,
      v_email_normalized,
      'claimed',
      'password',
      now()
    )
    RETURNING id INTO v_portal_account_id;

    v_account_action := 'create';
  END IF;

  INSERT INTO audit_logs (
    gym_id,
    actor_profile_id,
    entity_name,
    entity_id,
    action,
    diff
  )
  VALUES (
    p_gym_id,
    p_actor_profile_id,
    'client_portal_accounts',
    v_portal_account_id,
    v_account_action,
    jsonb_build_object(
      'source', 'manual_client_portal_activation',
      'client_id', p_client_id,
      'email', v_email_normalized,
      'auth_action', v_auth_action,
      'status', 'claimed',
      'primary_provider', 'password'
    )
  );

  RETURN jsonb_build_object(
    'ok', TRUE,
    'clientId', p_client_id,
    'portalAccountId', v_portal_account_id,
    'authUserId', v_auth_user_id,
    'email', v_email_normalized,
    'authAction', v_auth_action,
    'accountAction', v_account_action
  );
END;
$$;

GRANT EXECUTE ON FUNCTION app_manually_activate_client_portal_account(UUID, UUID, UUID, TEXT) TO authenticated;
