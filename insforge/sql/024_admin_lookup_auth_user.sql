CREATE OR REPLACE FUNCTION app_find_auth_user_id_by_email(
  p_actor_profile_id UUID,
  p_email TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_actor_role TEXT;
  v_auth_user_id UUID;
BEGIN
  SELECT role
    INTO v_actor_role
    FROM profiles
   WHERE id = p_actor_profile_id;

  IF v_actor_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Solo admin puede consultar usuarios auth';
  END IF;

  SELECT id
    INTO v_auth_user_id
    FROM auth.users
   WHERE lower(email) = lower(trim(COALESCE(p_email, '')))
   LIMIT 1;

  RETURN v_auth_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION app_find_auth_user_id_by_email(UUID, TEXT) TO authenticated;
