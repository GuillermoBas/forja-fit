CREATE OR REPLACE FUNCTION app_delete_pass_type(
  p_actor_profile_id UUID,
  p_pass_type_id UUID
) RETURNS UUID AS $$
DECLARE
  v_pass_type pass_types%ROWTYPE;
  v_pass_count INTEGER := 0;
BEGIN
  SELECT *
    INTO v_pass_type
  FROM pass_types
  WHERE id = p_pass_type_id;

  IF v_pass_type.id IS NULL THEN
    RAISE EXCEPTION 'Tipo de bono no encontrado';
  END IF;

  SELECT COUNT(*)
    INTO v_pass_count
  FROM passes
  WHERE pass_type_id = p_pass_type_id;

  IF v_pass_count > 0 THEN
    RAISE EXCEPTION 'No se puede borrar el tipo de bono porque ya tiene bonos asociados';
  END IF;

  DELETE FROM pass_types
  WHERE id = p_pass_type_id;

  INSERT INTO audit_logs (actor_profile_id, entity_name, entity_id, action, diff)
  VALUES (
    p_actor_profile_id,
    'pass_types',
    p_pass_type_id,
    'delete',
    jsonb_build_object(
      'name', v_pass_type.name,
      'kind', v_pass_type.kind,
      'price_gross', v_pass_type.price_gross,
      'vat_rate', v_pass_type.vat_rate
    )
  );

  RETURN p_pass_type_id;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION app_delete_pass_type(UUID, UUID) TO authenticated;
