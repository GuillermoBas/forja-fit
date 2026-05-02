CREATE OR REPLACE FUNCTION app_delete_pass(
  p_actor_profile_id UUID,
  p_pass_id UUID
) RETURNS UUID AS $$
DECLARE
  v_pass passes%ROWTYPE;
  v_sale_ids UUID[];
  v_mixed_sale_count INTEGER := 0;
  v_notification_count INTEGER := 0;
  v_calendar_count INTEGER := 0;
  v_renewal_children_count INTEGER := 0;
  v_session_count INTEGER := 0;
  v_pause_count INTEGER := 0;
  v_sale_count INTEGER := 0;
BEGIN
  SELECT *
    INTO v_pass
  FROM passes
  WHERE id = p_pass_id;

  IF v_pass.id IS NULL THEN
    RAISE EXCEPTION 'Bono no encontrado';
  END IF;

  SELECT COUNT(*)
    INTO v_renewal_children_count
  FROM passes
  WHERE renewed_from_pass_id = p_pass_id;

  IF v_renewal_children_count > 0 THEN
    RAISE EXCEPTION 'No se puede borrar el bono porque ya tiene renovaciones encadenadas';
  END IF;

  SELECT COUNT(*)
    INTO v_calendar_count
  FROM calendar_sessions
  WHERE pass_id = p_pass_id;

  IF v_calendar_count > 0 THEN
    RAISE EXCEPTION 'No se puede borrar el bono porque tiene sesiones de agenda asociadas';
  END IF;

  SELECT COUNT(*)
    INTO v_calendar_count
  FROM calendar_session_passes
  WHERE pass_id = p_pass_id;

  IF v_calendar_count > 0 THEN
    RAISE EXCEPTION 'No se puede borrar el bono porque tiene sesiones de agenda asociadas';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT sale_id), ARRAY[]::UUID[])
    INTO v_sale_ids
  FROM sale_items
  WHERE pass_id = p_pass_id
    AND sale_id IS NOT NULL;

  IF COALESCE(array_length(v_sale_ids, 1), 0) > 0 THEN
    SELECT COUNT(*)
      INTO v_mixed_sale_count
    FROM sales s
    WHERE s.id = ANY(v_sale_ids)
      AND EXISTS (
        SELECT 1
        FROM sale_items si
        WHERE si.sale_id = s.id
          AND COALESCE(si.pass_id, '00000000-0000-0000-0000-000000000000'::UUID) <> p_pass_id
      );

    IF v_mixed_sale_count > 0 THEN
      RAISE EXCEPTION 'No se puede borrar el bono porque su venta asociada contiene otras lineas';
    END IF;
  END IF;

  SELECT COUNT(*)
    INTO v_session_count
  FROM session_consumptions
  WHERE pass_id = p_pass_id;

  SELECT COUNT(*)
    INTO v_pause_count
  FROM pass_pauses
  WHERE pass_id = p_pass_id;

  SELECT COUNT(*)
    INTO v_notification_count
  FROM notification_log
  WHERE pass_id = p_pass_id
     OR (
       COALESCE(array_length(v_sale_ids, 1), 0) > 0
       AND sale_id = ANY(v_sale_ids)
     );

  v_sale_count := COALESCE(array_length(v_sale_ids, 1), 0);

  DELETE FROM notification_log
  WHERE pass_id = p_pass_id
     OR (
       COALESCE(array_length(v_sale_ids, 1), 0) > 0
       AND sale_id = ANY(v_sale_ids)
     );

  IF COALESCE(array_length(v_sale_ids, 1), 0) > 0 THEN
    DELETE FROM sale_items
    WHERE sale_id = ANY(v_sale_ids);

    DELETE FROM sales
    WHERE id = ANY(v_sale_ids);
  END IF;

  DELETE FROM passes
  WHERE id = p_pass_id;

  INSERT INTO audit_logs (actor_profile_id, entity_name, entity_id, action, diff)
  VALUES (
    p_actor_profile_id,
    'passes',
    p_pass_id,
    'delete',
    jsonb_build_object(
      'pass_type_id', v_pass.pass_type_id,
      'status', v_pass.status,
      'contracted_on', v_pass.contracted_on,
      'deleted_session_consumptions', v_session_count,
      'deleted_pass_pauses', v_pause_count,
      'deleted_notifications', v_notification_count,
      'deleted_sales', v_sale_count
    )
  );

  RETURN p_pass_id;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION app_delete_pass(UUID, UUID) TO authenticated;
