ALTER TABLE clients
  ALTER COLUMN last_name DROP NOT NULL;

CREATE OR REPLACE FUNCTION app_upsert_client(
  p_actor_profile_id UUID,
  p_client_id UUID,
  p_first_name TEXT,
  p_last_name TEXT,
  p_email TEXT,
  p_phone TEXT,
  p_tax_id TEXT,
  p_notes TEXT,
  p_is_active BOOLEAN
) RETURNS UUID AS $$
DECLARE
  v_client_id UUID;
BEGIN
  IF NULLIF(btrim(COALESCE(p_first_name, '')), '') IS NULL THEN
    RAISE EXCEPTION 'El nombre del cliente es obligatorio';
  END IF;

  p_first_name := btrim(p_first_name);
  p_last_name := NULLIF(btrim(COALESCE(p_last_name, '')), '');

  IF p_client_id IS NULL THEN
    INSERT INTO clients (
      first_name,
      last_name,
      email,
      phone,
      tax_id,
      notes,
      is_active
    )
    VALUES (
      p_first_name,
      p_last_name,
      NULLIF(p_email, ''),
      NULLIF(p_phone, ''),
      NULLIF(p_tax_id, ''),
      NULLIF(p_notes, ''),
      COALESCE(p_is_active, TRUE)
    )
    RETURNING id INTO v_client_id;

    INSERT INTO audit_logs (actor_profile_id, entity_name, entity_id, action, diff)
    VALUES (
      p_actor_profile_id,
      'clients',
      v_client_id,
      'create',
      jsonb_build_object('first_name', p_first_name, 'last_name', p_last_name)
    );
  ELSE
    UPDATE clients
       SET first_name = p_first_name,
           last_name = p_last_name,
           email = NULLIF(p_email, ''),
           phone = NULLIF(p_phone, ''),
           tax_id = NULLIF(p_tax_id, ''),
           notes = NULLIF(p_notes, ''),
           is_active = COALESCE(p_is_active, TRUE),
           updated_at = NOW()
     WHERE id = p_client_id
     RETURNING id INTO v_client_id;

    INSERT INTO audit_logs (actor_profile_id, entity_name, entity_id, action, diff)
    VALUES (
      p_actor_profile_id,
      'clients',
      v_client_id,
      'update',
      jsonb_build_object('first_name', p_first_name, 'last_name', p_last_name)
    );
  END IF;

  RETURN v_client_id;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION app_upsert_client(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN) TO authenticated;
