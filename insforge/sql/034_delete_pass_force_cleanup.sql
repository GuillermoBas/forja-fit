CREATE OR REPLACE FUNCTION app_delete_pass(
  p_actor_profile_id UUID,
  p_pass_id UUID
) RETURNS UUID AS $$
DECLARE
  v_actor profiles%ROWTYPE;
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
    INTO v_actor
  FROM profiles
  WHERE id = p_actor_profile_id;

  IF v_actor.id IS NULL OR v_actor.role <> 'admin' THEN
    RAISE EXCEPTION 'Solo admin puede borrar bonos';
  END IF;

  SELECT *
    INTO v_pass
  FROM passes
  WHERE id = p_pass_id
    AND gym_id = v_actor.gym_id
  FOR UPDATE;

  IF v_pass.id IS NULL THEN
    RAISE EXCEPTION 'Bono no encontrado';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT sale_id), ARRAY[]::UUID[])
    INTO v_sale_ids
  FROM sale_items
  WHERE gym_id = v_pass.gym_id
    AND pass_id = p_pass_id
    AND sale_id IS NOT NULL;

  IF COALESCE(array_length(v_sale_ids, 1), 0) > 0 THEN
    SELECT COUNT(*)
      INTO v_mixed_sale_count
    FROM sales s
    WHERE s.gym_id = v_pass.gym_id
      AND s.id = ANY(v_sale_ids)
      AND EXISTS (
        SELECT 1
        FROM sale_items si
        WHERE si.gym_id = s.gym_id
          AND si.sale_id = s.id
          AND COALESCE(si.pass_id, '00000000-0000-0000-0000-000000000000'::UUID) <> p_pass_id
      );

    IF v_mixed_sale_count > 0 THEN
      RAISE EXCEPTION 'No se puede borrar el bono porque su venta asociada contiene otras lineas';
    END IF;
  END IF;

  SELECT COUNT(*)
    INTO v_renewal_children_count
  FROM passes
  WHERE gym_id = v_pass.gym_id
    AND renewed_from_pass_id = p_pass_id;

  SELECT COUNT(DISTINCT session_id)
    INTO v_calendar_count
  FROM (
    SELECT id AS session_id
    FROM calendar_sessions
    WHERE gym_id = v_pass.gym_id
      AND pass_id = p_pass_id
    UNION
    SELECT session_id
    FROM calendar_session_passes
    WHERE gym_id = v_pass.gym_id
      AND pass_id = p_pass_id
  ) pass_sessions;

  SELECT COUNT(*)
    INTO v_session_count
  FROM session_consumptions
  WHERE gym_id = v_pass.gym_id
    AND pass_id = p_pass_id;

  SELECT COUNT(*)
    INTO v_pause_count
  FROM pass_pauses
  WHERE gym_id = v_pass.gym_id
    AND pass_id = p_pass_id;

  SELECT COUNT(*)
    INTO v_notification_count
  FROM notification_log
  WHERE gym_id = v_pass.gym_id
    AND (
      pass_id = p_pass_id
      OR (
        COALESCE(array_length(v_sale_ids, 1), 0) > 0
        AND sale_id = ANY(v_sale_ids)
      )
    );

  v_sale_count := COALESCE(array_length(v_sale_ids, 1), 0);

  UPDATE passes
     SET renewed_from_pass_id = NULL,
         updated_at = NOW()
   WHERE gym_id = v_pass.gym_id
     AND renewed_from_pass_id = p_pass_id;

  DELETE FROM notification_log
  WHERE gym_id = v_pass.gym_id
    AND (
      pass_id = p_pass_id
      OR (
        COALESCE(array_length(v_sale_ids, 1), 0) > 0
        AND sale_id = ANY(v_sale_ids)
      )
    );

  DELETE FROM calendar_session_passes
  WHERE gym_id = v_pass.gym_id
    AND pass_id = p_pass_id;

  UPDATE calendar_sessions cs
     SET pass_id = (
           SELECT csp.pass_id
           FROM calendar_session_passes csp
           WHERE csp.gym_id = cs.gym_id
             AND csp.session_id = cs.id
           ORDER BY csp.created_at, csp.id
           LIMIT 1
         ),
         client_1_id = (
           SELECT ph.client_id
           FROM calendar_session_passes csp
           JOIN pass_holders ph
             ON ph.gym_id = csp.gym_id
            AND ph.pass_id = csp.pass_id
           WHERE csp.gym_id = cs.gym_id
             AND csp.session_id = cs.id
           ORDER BY ph.holder_order, ph.client_id
           LIMIT 1
         ),
         client_2_id = (
           SELECT ph.client_id
           FROM calendar_session_passes csp
           JOIN pass_holders ph
             ON ph.gym_id = csp.gym_id
            AND ph.pass_id = csp.pass_id
           WHERE csp.gym_id = cs.gym_id
             AND csp.session_id = cs.id
           ORDER BY ph.holder_order, ph.client_id
           OFFSET 1
           LIMIT 1
         ),
         updated_at = NOW()
   WHERE cs.gym_id = v_pass.gym_id
     AND cs.pass_id = p_pass_id
     AND EXISTS (
       SELECT 1
       FROM calendar_session_passes csp
       WHERE csp.gym_id = cs.gym_id
         AND csp.session_id = cs.id
     );

  DELETE FROM calendar_sessions cs
  WHERE cs.gym_id = v_pass.gym_id
    AND cs.pass_id = p_pass_id
    AND NOT EXISTS (
      SELECT 1
      FROM calendar_session_passes csp
      WHERE csp.gym_id = cs.gym_id
        AND csp.session_id = cs.id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM session_consumptions sc
      WHERE sc.gym_id = cs.gym_id
        AND sc.calendar_session_id = cs.id
        AND sc.pass_id <> p_pass_id
    );

  UPDATE calendar_sessions cs
     SET pass_id = NULL,
         updated_at = NOW()
   WHERE cs.gym_id = v_pass.gym_id
     AND cs.pass_id = p_pass_id;

  IF COALESCE(array_length(v_sale_ids, 1), 0) > 0 THEN
    DELETE FROM sale_items
    WHERE gym_id = v_pass.gym_id
      AND sale_id = ANY(v_sale_ids);

    DELETE FROM sales
    WHERE gym_id = v_pass.gym_id
      AND id = ANY(v_sale_ids);
  END IF;

  DELETE FROM passes
  WHERE id = p_pass_id
    AND gym_id = v_pass.gym_id;

  INSERT INTO audit_logs (gym_id, actor_profile_id, entity_name, entity_id, action, diff)
  VALUES (
    v_pass.gym_id,
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
      'deleted_sales', v_sale_count,
      'deleted_calendar_sessions', v_calendar_count,
      'detached_renewal_children', v_renewal_children_count,
      'forced_cleanup', TRUE
    )
  );

  RETURN p_pass_id;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION app_delete_pass(UUID, UUID) TO authenticated;
