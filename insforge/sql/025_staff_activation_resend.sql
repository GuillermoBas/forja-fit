CREATE OR REPLACE FUNCTION app_is_staff_email_verified(
  p_actor_profile_id UUID,
  p_profile_id UUID
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_actor_role TEXT;
  v_email_verified BOOLEAN;
BEGIN
  SELECT role
    INTO v_actor_role
    FROM profiles
   WHERE id = p_actor_profile_id;

  IF v_actor_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Solo admin puede consultar el estado de activacion staff';
  END IF;

  SELECT COALESCE(u.email_verified, FALSE)
    INTO v_email_verified
    FROM profiles p
    LEFT JOIN auth.users u
      ON u.id = p.auth_user_id
   WHERE p.id = p_profile_id
     AND p.role IN ('admin', 'trainer')
   LIMIT 1;

  RETURN COALESCE(v_email_verified, FALSE);
END;
$$;

GRANT EXECUTE ON FUNCTION app_is_staff_email_verified(UUID, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION app_get_staff_verification_states(
  p_actor_profile_id UUID
) RETURNS TABLE (
  profile_id UUID,
  email_verified BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_actor_role TEXT;
BEGIN
  SELECT role
    INTO v_actor_role
    FROM profiles
   WHERE id = p_actor_profile_id;

  IF v_actor_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Solo admin puede consultar el estado de activacion staff';
  END IF;

  RETURN QUERY
  SELECT
    p.id AS profile_id,
    COALESCE(u.email_verified, FALSE) AS email_verified
  FROM profiles p
  LEFT JOIN auth.users u
    ON u.id = p.auth_user_id
  WHERE p.role IN ('admin', 'trainer');
END;
$$;

GRANT EXECUTE ON FUNCTION app_get_staff_verification_states(UUID) TO authenticated;
