ALTER TABLE passes
ADD COLUMN IF NOT EXISTS pass_sub_type TEXT
CHECK (pass_sub_type IN ('individual', 'shared_2', 'shared_3'));

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

GRANT EXECUTE ON FUNCTION app_create_pass(UUID, UUID, UUID[], UUID, TEXT, TEXT, NUMERIC, DATE, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION app_update_pass(UUID, UUID, UUID, UUID[], UUID, TEXT, DATE, TEXT, INTEGER, TEXT) TO authenticated;
