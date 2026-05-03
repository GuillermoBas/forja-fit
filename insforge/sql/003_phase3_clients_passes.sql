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

CREATE OR REPLACE FUNCTION app_replace_pass_holders(
  p_pass_id UUID,
  p_holder_client_ids UUID[]
) RETURNS VOID AS $$
DECLARE
  v_holder_count INTEGER;
  v_distinct_count INTEGER;
BEGIN
  v_holder_count := COALESCE(array_length(p_holder_client_ids, 1), 0);

  IF v_holder_count < 1 THEN
    RAISE EXCEPTION 'Debes indicar al menos un titular';
  END IF;

  IF v_holder_count > 5 THEN
    RAISE EXCEPTION 'Un bono compartido admite un maximo de 5 titulares';
  END IF;

  SELECT COUNT(DISTINCT holder_id)
    INTO v_distinct_count
  FROM unnest(p_holder_client_ids) AS holder_id;

  IF v_distinct_count <> v_holder_count THEN
    RAISE EXCEPTION 'Los titulares del bono deben ser distintos';
  END IF;

  DELETE FROM pass_holders
  WHERE pass_id = p_pass_id;

  INSERT INTO pass_holders (pass_id, client_id, holder_order)
  SELECT p_pass_id, holder_id, holder_order
  FROM unnest(p_holder_client_ids) WITH ORDINALITY AS holders(holder_id, holder_order);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION app_upsert_pass_type(
  p_actor_profile_id UUID,
  p_pass_type_id UUID,
  p_name TEXT,
  p_kind TEXT,
  p_sessions_total INTEGER,
  p_price_gross NUMERIC,
  p_vat_rate NUMERIC,
  p_shared_allowed BOOLEAN,
  p_is_active BOOLEAN,
  p_sort_order INTEGER
) RETURNS UUID AS $$
DECLARE
  v_pass_type_id UUID;
BEGIN
  IF p_kind NOT IN ('session', 'monthly') THEN
    RAISE EXCEPTION 'Tipo de bono no valido';
  END IF;

  IF p_kind = 'session' AND (p_sessions_total IS NULL OR p_sessions_total < 1 OR p_sessions_total > 30) THEN
    RAISE EXCEPTION 'Los bonos por sesiones deben tener entre 1 y 30 sesiones';
  END IF;

  IF p_kind = 'monthly' THEN
    p_sessions_total := NULL;
  END IF;

  IF p_pass_type_id IS NULL THEN
    INSERT INTO pass_types (
      name,
      kind,
      sessions_total,
      price_gross,
      vat_rate,
      shared_allowed,
      is_active,
      sort_order
    )
    VALUES (
      p_name,
      p_kind,
      p_sessions_total,
      p_price_gross,
      p_vat_rate,
      COALESCE(p_shared_allowed, TRUE),
      COALESCE(p_is_active, TRUE),
      COALESCE(p_sort_order, 0)
    )
    RETURNING id INTO v_pass_type_id;

    INSERT INTO audit_logs (actor_profile_id, entity_name, entity_id, action, diff)
    VALUES (
      p_actor_profile_id,
      'pass_types',
      v_pass_type_id,
      'create',
      jsonb_build_object('name', p_name, 'kind', p_kind, 'sessions_total', p_sessions_total)
    );
  ELSE
    UPDATE pass_types
       SET name = p_name,
           kind = p_kind,
           sessions_total = p_sessions_total,
           price_gross = p_price_gross,
           vat_rate = p_vat_rate,
           shared_allowed = COALESCE(p_shared_allowed, TRUE),
           is_active = COALESCE(p_is_active, TRUE),
           sort_order = COALESCE(p_sort_order, 0),
           updated_at = NOW()
     WHERE id = p_pass_type_id
     RETURNING id INTO v_pass_type_id;

    INSERT INTO audit_logs (actor_profile_id, entity_name, entity_id, action, diff)
    VALUES (
      p_actor_profile_id,
      'pass_types',
      v_pass_type_id,
      'update',
      jsonb_build_object('name', p_name, 'kind', p_kind, 'sessions_total', p_sessions_total)
    );
  END IF;

  RETURN v_pass_type_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION app_create_pass(
  p_actor_profile_id UUID,
  p_pass_type_id UUID,
  p_holder_client_ids UUID[],
  p_purchased_by_client_id UUID,
  p_pass_sub_type TEXT,
  p_payment_method TEXT,
  p_price_gross_override NUMERIC,
  p_contracted_on DATE,
  p_notes TEXT
) RETURNS JSONB AS $$
DECLARE
  v_pass_id UUID;
  v_sale_id UUID;
  v_pass_type pass_types%ROWTYPE;
  v_primary_holder_id UUID;
  v_price_gross NUMERIC(10,2);
  v_subtotal_net NUMERIC(10,2);
  v_vat_total NUMERIC(10,2);
BEGIN
  SELECT *
    INTO v_pass_type
  FROM pass_types
  WHERE id = p_pass_type_id
    AND is_active = TRUE;

  IF v_pass_type.id IS NULL THEN
    RAISE EXCEPTION 'Tipo de bono no valido';
  END IF;

  IF NOT v_pass_type.shared_allowed AND COALESCE(array_length(p_holder_client_ids, 1), 0) > 1 THEN
    RAISE EXCEPTION 'Este tipo de bono no admite titulares compartidos';
  END IF;

  IF p_payment_method NOT IN ('cash', 'card', 'transfer', 'bizum') THEN
    RAISE EXCEPTION 'Metodo de pago no valido';
  END IF;

  IF NULLIF(COALESCE(p_pass_sub_type, ''), '') IS NOT NULL
     AND p_pass_sub_type NOT IN ('individual', 'shared_2', 'shared_3') THEN
    RAISE EXCEPTION 'Sub tipo de bono no valido';
  END IF;

  IF p_price_gross_override IS NOT NULL AND (
    p_price_gross_override < 0
    OR p_price_gross_override <> trunc(p_price_gross_override)
  ) THEN
    RAISE EXCEPTION 'El precio del bono debe ser un numero entero en euros';
  END IF;

  v_primary_holder_id := p_holder_client_ids[1];
  v_price_gross := COALESCE(p_price_gross_override, v_pass_type.price_gross);

  INSERT INTO passes (
    pass_type_id,
    purchased_by_client_id,
    contracted_on,
    expires_on,
    pass_sub_type,
    sold_price_gross,
    status,
    original_sessions,
    sessions_left,
    notes,
    created_by_profile_id
  )
  VALUES (
    p_pass_type_id,
    p_purchased_by_client_id,
    p_contracted_on,
    calculate_pass_expiry(v_pass_type.kind, p_contracted_on),
    NULLIF(p_pass_sub_type, ''),
    v_price_gross,
    'active',
    CASE WHEN v_pass_type.kind = 'session' THEN v_pass_type.sessions_total ELSE NULL END,
    CASE WHEN v_pass_type.kind = 'session' THEN v_pass_type.sessions_total ELSE NULL END,
    NULLIF(p_notes, ''),
    p_actor_profile_id
  )
  RETURNING id INTO v_pass_id;

  PERFORM app_replace_pass_holders(v_pass_id, p_holder_client_ids);

  v_subtotal_net := ROUND(v_price_gross / (1 + (v_pass_type.vat_rate / 100.0)), 2);
  v_vat_total := ROUND(v_price_gross - v_subtotal_net, 2);

  INSERT INTO sales (
    sold_at,
    client_id,
    handled_by_profile_id,
    payment_method,
    status,
    subtotal_net,
    vat_total,
    total_gross,
    invoice_series,
    internal_note
  )
  VALUES (
    ((p_contracted_on::timestamp + TIME '12:00') AT TIME ZONE 'Europe/Madrid'),
    v_primary_holder_id,
    p_actor_profile_id,
    p_payment_method,
    'posted',
    v_subtotal_net,
    v_vat_total,
    v_price_gross,
    'FF',
    'Alta de bono'
  )
  RETURNING id INTO v_sale_id;

  INSERT INTO sale_items (
    sale_id,
    item_type,
    pass_id,
    description_snapshot,
    qty,
    unit_price_gross,
    vat_rate,
    line_total_gross
  )
  VALUES (
    v_sale_id,
    'pass',
    v_pass_id,
    v_pass_type.name,
    1,
    v_price_gross,
    v_pass_type.vat_rate,
    v_price_gross
  );

  INSERT INTO audit_logs (actor_profile_id, entity_name, entity_id, action, diff)
  VALUES (
    p_actor_profile_id,
    'passes',
    v_pass_id,
    'create',
    jsonb_build_object(
      'pass_type_id', p_pass_type_id,
      'kind', v_pass_type.kind,
      'sessions_total', v_pass_type.sessions_total,
      'holder_count', COALESCE(array_length(p_holder_client_ids, 1), 0),
      'sale_id', v_sale_id,
      'price_gross', v_price_gross,
      'payment_method', p_payment_method,
      'pass_sub_type', NULLIF(p_pass_sub_type, '')
    )
  );

  RETURN jsonb_build_object(
    'pass_id', v_pass_id,
    'sale_id', v_sale_id
  );
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION app_update_pass(
  p_actor_profile_id UUID,
  p_pass_id UUID,
  p_pass_type_id UUID,
  p_holder_client_ids UUID[],
  p_purchased_by_client_id UUID,
  p_pass_sub_type TEXT,
  p_contracted_on DATE,
  p_status TEXT,
  p_sessions_left INTEGER,
  p_notes TEXT
) RETURNS UUID AS $$
DECLARE
  v_pass passes%ROWTYPE;
  v_pass_type pass_types%ROWTYPE;
  v_pause_days INTEGER := 0;
  v_effective_sessions_left INTEGER;
BEGIN
  SELECT *
    INTO v_pass
  FROM passes
  WHERE id = p_pass_id;

  IF v_pass.id IS NULL THEN
    RAISE EXCEPTION 'Bono no encontrado';
  END IF;

  SELECT *
    INTO v_pass_type
  FROM pass_types
  WHERE id = p_pass_type_id
    AND is_active = TRUE;

  IF v_pass_type.id IS NULL THEN
    RAISE EXCEPTION 'Tipo de bono no valido';
  END IF;

  IF NOT v_pass_type.shared_allowed AND COALESCE(array_length(p_holder_client_ids, 1), 0) > 1 THEN
    RAISE EXCEPTION 'Este tipo de bono no admite titulares compartidos';
  END IF;

  IF NULLIF(COALESCE(p_pass_sub_type, ''), '') IS NOT NULL
     AND p_pass_sub_type NOT IN ('individual', 'shared_2', 'shared_3') THEN
    RAISE EXCEPTION 'Sub tipo de bono no valido';
  END IF;

  IF p_status NOT IN ('active', 'paused', 'out_of_sessions', 'expired', 'cancelled') THEN
    RAISE EXCEPTION 'Estado de bono no valido';
  END IF;

  IF v_pass_type.kind = 'monthly' AND p_status = 'out_of_sessions' THEN
    RAISE EXCEPTION 'Los bonos mensuales no usan el estado sin sesiones';
  END IF;

  SELECT COALESCE(SUM(pause_days), 0)
    INTO v_pause_days
  FROM pass_pauses
  WHERE pass_id = p_pass_id;

  IF v_pass_type.kind = 'session' THEN
    v_effective_sessions_left := COALESCE(
      p_sessions_left,
      LEAST(COALESCE(v_pass.sessions_left, v_pass_type.sessions_total), v_pass_type.sessions_total)
    );

    IF v_effective_sessions_left < 0 OR v_effective_sessions_left > v_pass_type.sessions_total THEN
      RAISE EXCEPTION 'El saldo de sesiones debe quedar entre 0 y %', v_pass_type.sessions_total;
    END IF;

    IF v_effective_sessions_left = 0 AND p_status NOT IN ('expired', 'cancelled') THEN
      p_status := 'out_of_sessions';
    END IF;
  ELSE
    v_effective_sessions_left := NULL;
  END IF;

  UPDATE passes
       SET pass_type_id = p_pass_type_id,
           purchased_by_client_id = p_purchased_by_client_id,
           contracted_on = p_contracted_on,
           expires_on = calculate_pass_expiry(v_pass_type.kind, p_contracted_on) + v_pause_days,
           pass_sub_type = NULLIF(p_pass_sub_type, ''),
           sold_price_gross = COALESCE(v_pass.sold_price_gross, v_pass_type.price_gross),
           status = p_status,
         original_sessions = CASE WHEN v_pass_type.kind = 'session' THEN v_pass_type.sessions_total ELSE NULL END,
         sessions_left = CASE WHEN v_pass_type.kind = 'session' THEN v_effective_sessions_left ELSE NULL END,
         notes = NULLIF(p_notes, ''),
         updated_at = NOW()
   WHERE id = p_pass_id;

  PERFORM app_replace_pass_holders(p_pass_id, p_holder_client_ids);

  INSERT INTO audit_logs (actor_profile_id, entity_name, entity_id, action, diff)
  VALUES (
    p_actor_profile_id,
    'passes',
    p_pass_id,
    'update',
    jsonb_build_object(
      'pass_type_id', p_pass_type_id,
      'kind', v_pass_type.kind,
      'sessions_left', v_effective_sessions_left,
      'status', p_status,
      'holder_count', COALESCE(array_length(p_holder_client_ids, 1), 0),
      'pass_sub_type', NULLIF(p_pass_sub_type, '')
    )
  );

  RETURN p_pass_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION app_delete_pass(
  p_actor_profile_id UUID,
  p_pass_id UUID
) RETURNS UUID AS $$
DECLARE
  v_pass passes%ROWTYPE;
  v_session_count INTEGER := 0;
  v_pause_count INTEGER := 0;
  v_sale_item_count INTEGER := 0;
  v_notification_count INTEGER := 0;
  v_calendar_count INTEGER := 0;
  v_renewal_children_count INTEGER := 0;
BEGIN
  SELECT *
    INTO v_pass
  FROM passes
  WHERE id = p_pass_id;

  IF v_pass.id IS NULL THEN
    RAISE EXCEPTION 'Bono no encontrado';
  END IF;

  SELECT COUNT(*) INTO v_session_count FROM session_consumptions WHERE pass_id = p_pass_id;
  IF v_session_count > 0 THEN
    RAISE EXCEPTION 'No se puede borrar el bono porque tiene sesiones consumidas';
  END IF;

  SELECT COUNT(*) INTO v_pause_count FROM pass_pauses WHERE pass_id = p_pass_id;
  IF v_pause_count > 0 THEN
    RAISE EXCEPTION 'No se puede borrar el bono porque tiene pausas registradas';
  END IF;

  SELECT COUNT(*) INTO v_sale_item_count FROM sale_items WHERE pass_id = p_pass_id;
  IF v_sale_item_count > 0 THEN
    RAISE EXCEPTION 'No se puede borrar el bono porque tiene ventas asociadas';
  END IF;

  SELECT COUNT(*) INTO v_notification_count FROM notification_log WHERE pass_id = p_pass_id;
  IF v_notification_count > 0 THEN
    RAISE EXCEPTION 'No se puede borrar el bono porque tiene notificaciones asociadas';
  END IF;

  SELECT COUNT(*) INTO v_calendar_count FROM calendar_sessions WHERE pass_id = p_pass_id;
  IF v_calendar_count > 0 THEN
    RAISE EXCEPTION 'No se puede borrar el bono porque tiene sesiones de agenda asociadas';
  END IF;

  SELECT COUNT(*) INTO v_renewal_children_count FROM passes WHERE renewed_from_pass_id = p_pass_id;
  IF v_renewal_children_count > 0 THEN
    RAISE EXCEPTION 'No se puede borrar el bono porque ya tiene renovaciones encadenadas';
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
      'contracted_on', v_pass.contracted_on
    )
  );

  RETURN p_pass_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION app_consume_session(
  p_actor_profile_id UUID,
  p_pass_id UUID,
  p_client_id UUID,
  p_consumed_at TIMESTAMPTZ,
  p_notes TEXT
) RETURNS UUID AS $$
DECLARE
  v_consumption_id UUID;
BEGIN
  INSERT INTO session_consumptions (
    pass_id,
    client_id,
    consumed_at,
    recorded_by_profile_id,
    notes
  )
  VALUES (
    p_pass_id,
    p_client_id,
    COALESCE(p_consumed_at, NOW()),
    p_actor_profile_id,
    NULLIF(p_notes, '')
  )
  RETURNING id INTO v_consumption_id;

  INSERT INTO audit_logs (actor_profile_id, entity_name, entity_id, action, diff)
  VALUES (
    p_actor_profile_id,
    'session_consumptions',
    v_consumption_id,
    'consume',
    jsonb_build_object('pass_id', p_pass_id, 'client_id', p_client_id)
  );

  RETURN v_consumption_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION app_pause_pass(
  p_actor_profile_id UUID,
  p_pass_id UUID,
  p_starts_on DATE,
  p_ends_on DATE,
  p_reason TEXT
) RETURNS UUID AS $$
DECLARE
  v_pause_id UUID;
BEGIN
  INSERT INTO pass_pauses (
    pass_id,
    starts_on,
    ends_on,
    pause_days,
    reason,
    approved_by_profile_id
  )
  VALUES (
    p_pass_id,
    p_starts_on,
    p_ends_on,
    ((p_ends_on - p_starts_on) + 1),
    NULLIF(p_reason, ''),
    p_actor_profile_id
  )
  RETURNING id INTO v_pause_id;

  INSERT INTO audit_logs (actor_profile_id, entity_name, entity_id, action, diff)
  VALUES (
    p_actor_profile_id,
    'pass_pauses',
    v_pause_id,
    'pause',
    jsonb_build_object('pass_id', p_pass_id, 'starts_on', p_starts_on, 'ends_on', p_ends_on)
  );

  RETURN v_pause_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION app_renew_pass(
  p_actor_profile_id UUID,
  p_old_pass_id UUID,
  p_pass_type_id UUID,
  p_payment_method TEXT,
  p_price_gross_override NUMERIC,
  p_contracted_on DATE,
  p_notes TEXT
) RETURNS JSONB AS $$
DECLARE
  v_old_pass passes%ROWTYPE;
  v_pass_type pass_types%ROWTYPE;
  v_new_pass_id UUID;
  v_sale_id UUID;
  v_price_gross NUMERIC(10,2);
  v_subtotal_net NUMERIC(10,2);
  v_vat_total NUMERIC(10,2);
  v_primary_holder_id UUID;
  v_holder_client_ids UUID[];
BEGIN
  SELECT *
    INTO v_old_pass
  FROM passes
  WHERE id = p_old_pass_id;

  IF v_old_pass.id IS NULL THEN
    RAISE EXCEPTION 'Bono original no encontrado';
  END IF;

  SELECT *
    INTO v_pass_type
  FROM pass_types
  WHERE id = p_pass_type_id
    AND is_active = TRUE;

  IF v_pass_type.id IS NULL THEN
    RAISE EXCEPTION 'Tipo de bono no valido';
  END IF;

  SELECT array_agg(client_id ORDER BY holder_order)
    INTO v_holder_client_ids
  FROM pass_holders
  WHERE pass_id = p_old_pass_id;

  IF COALESCE(array_length(v_holder_client_ids, 1), 0) < 1 THEN
    RAISE EXCEPTION 'El bono original no tiene titulares';
  END IF;

  v_primary_holder_id := v_holder_client_ids[1];
  v_price_gross := COALESCE(p_price_gross_override, v_old_pass.sold_price_gross, v_pass_type.price_gross);

  IF v_price_gross < 0 OR v_price_gross <> trunc(v_price_gross) THEN
    RAISE EXCEPTION 'El precio de renovacion debe ser un numero entero en euros';
  END IF;

  INSERT INTO passes (
    pass_type_id,
    purchased_by_client_id,
    renewed_from_pass_id,
    contracted_on,
    expires_on,
    sold_price_gross,
    status,
    original_sessions,
    sessions_left,
    notes,
    created_by_profile_id
  )
  VALUES (
    p_pass_type_id,
    COALESCE(v_old_pass.purchased_by_client_id, v_primary_holder_id),
    p_old_pass_id,
    p_contracted_on,
    calculate_pass_expiry(v_pass_type.kind, p_contracted_on),
    v_price_gross,
    'active',
    CASE WHEN v_pass_type.kind = 'session' THEN v_pass_type.sessions_total ELSE NULL END,
    CASE WHEN v_pass_type.kind = 'session' THEN v_pass_type.sessions_total ELSE NULL END,
    NULLIF(p_notes, ''),
    p_actor_profile_id
  )
  RETURNING id INTO v_new_pass_id;

  PERFORM app_replace_pass_holders(v_new_pass_id, v_holder_client_ids);

  v_subtotal_net := ROUND(v_price_gross / (1 + (v_pass_type.vat_rate / 100.0)), 2);
  v_vat_total := ROUND(v_price_gross - v_subtotal_net, 2);

  INSERT INTO sales (
    sold_at,
    client_id,
    handled_by_profile_id,
    payment_method,
    status,
    subtotal_net,
    vat_total,
    total_gross,
    invoice_series,
    internal_note
  )
  VALUES (
    ((p_contracted_on::timestamp + TIME '12:00') AT TIME ZONE 'Europe/Madrid'),
    v_primary_holder_id,
    p_actor_profile_id,
    p_payment_method,
    'posted',
    v_subtotal_net,
    v_vat_total,
    v_price_gross,
    'FF',
    'Renovacion de bono'
  )
  RETURNING id INTO v_sale_id;

  INSERT INTO sale_items (
    sale_id,
    item_type,
    pass_id,
    description_snapshot,
    qty,
    unit_price_gross,
    vat_rate,
    line_total_gross
  )
  VALUES (
    v_sale_id,
    'pass',
    v_new_pass_id,
    v_pass_type.name,
    1,
    v_price_gross,
    v_pass_type.vat_rate,
    v_price_gross
  );

  INSERT INTO notification_log (
    client_id,
    pass_id,
    sale_id,
    channel,
    event_type,
    status,
    recipient,
    subject,
    body,
    processed_at
  )
  VALUES (
    v_primary_holder_id,
    v_new_pass_id,
    v_sale_id,
    'internal',
    'renewal_confirmation',
    'sent',
    'staff',
    'Renovacion registrada',
    'Renovacion registrada. Confirmar por WhatsApp con el cliente.',
    NOW()
  );

  INSERT INTO audit_logs (actor_profile_id, entity_name, entity_id, action, diff)
  VALUES (
    p_actor_profile_id,
    'passes',
    v_new_pass_id,
    'renew',
    jsonb_build_object('renewed_from_pass_id', p_old_pass_id, 'sale_id', v_sale_id)
  );

  RETURN jsonb_build_object(
    'pass_id', v_new_pass_id,
    'sale_id', v_sale_id
  );
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION app_upsert_client(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION app_upsert_pass_type(UUID, UUID, TEXT, TEXT, INTEGER, NUMERIC, NUMERIC, BOOLEAN, BOOLEAN, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION app_create_pass(UUID, UUID, UUID[], UUID, TEXT, TEXT, NUMERIC, DATE, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION app_update_pass(UUID, UUID, UUID, UUID[], UUID, TEXT, DATE, TEXT, INTEGER, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION app_delete_pass(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION app_consume_session(UUID, UUID, UUID, TIMESTAMPTZ, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION app_pause_pass(UUID, UUID, DATE, DATE, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION app_renew_pass(UUID, UUID, UUID, TEXT, NUMERIC, DATE, TEXT) TO authenticated;
