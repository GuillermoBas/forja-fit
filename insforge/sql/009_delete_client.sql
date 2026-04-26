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

GRANT EXECUTE ON FUNCTION app_delete_client(UUID, UUID) TO authenticated;
