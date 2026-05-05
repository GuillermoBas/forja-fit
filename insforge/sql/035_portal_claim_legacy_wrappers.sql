DROP FUNCTION IF EXISTS app_claim_client_portal_account(UUID, TEXT, TEXT);
CREATE OR REPLACE FUNCTION app_claim_client_portal_account(
  p_auth_user_id UUID,
  p_email TEXT,
  p_provider TEXT
) RETURNS JSONB AS $$
DECLARE
  v_gym_id UUID;
BEGIN
  SELECT id
    INTO v_gym_id
  FROM gyms
  WHERE slug = 'eltemplo'
    AND status = 'active'
  LIMIT 1;

  IF v_gym_id IS NULL THEN
    RAISE EXCEPTION 'Gimnasio por defecto no encontrado';
  END IF;

  RETURN app_claim_client_portal_account(
    p_auth_user_id,
    v_gym_id,
    p_email,
    p_provider
  );
END;
$$ LANGUAGE plpgsql;

DROP FUNCTION IF EXISTS app_record_client_portal_login(UUID, TEXT);
CREATE OR REPLACE FUNCTION app_record_client_portal_login(
  p_auth_user_id UUID,
  p_provider TEXT
) RETURNS JSONB AS $$
DECLARE
  v_gym_id UUID;
BEGIN
  SELECT id
    INTO v_gym_id
  FROM gyms
  WHERE slug = 'eltemplo'
    AND status = 'active'
  LIMIT 1;

  IF v_gym_id IS NULL THEN
    RAISE EXCEPTION 'Gimnasio por defecto no encontrado';
  END IF;

  RETURN app_record_client_portal_login(
    p_auth_user_id,
    v_gym_id,
    p_provider
  );
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION app_claim_client_portal_account(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION app_record_client_portal_login(UUID, TEXT) TO authenticated;
