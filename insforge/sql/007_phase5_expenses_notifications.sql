CREATE INDEX IF NOT EXISTS idx_notification_log_pass_event_channel
  ON notification_log (pass_id, event_type, channel);

CREATE INDEX IF NOT EXISTS idx_notification_log_sale_id
  ON notification_log (sale_id);

CREATE OR REPLACE FUNCTION app_create_expense(
  p_actor_profile_id UUID,
  p_expense_id UUID,
  p_spent_on DATE,
  p_category TEXT,
  p_supplier TEXT,
  p_payment_method TEXT,
  p_base_amount NUMERIC,
  p_vat_amount NUMERIC,
  p_total_amount NUMERIC,
  p_note TEXT
) RETURNS UUID AS $$
DECLARE
  v_expense_id UUID;
  v_total_amount NUMERIC(10,2);
BEGIN
  IF COALESCE(trim(p_category), '') = '' THEN
    RAISE EXCEPTION 'La categoria es obligatoria';
  END IF;

  IF p_payment_method NOT IN ('cash', 'card', 'transfer', 'bizum') THEN
    RAISE EXCEPTION 'Metodo de pago no valido';
  END IF;

  IF COALESCE(p_base_amount, -1) < 0 OR COALESCE(p_vat_amount, -1) < 0 THEN
    RAISE EXCEPTION 'Los importes no pueden ser negativos';
  END IF;

  v_total_amount := ROUND(COALESCE(p_total_amount, p_base_amount + p_vat_amount)::numeric, 2);

  IF p_expense_id IS NULL THEN
    INSERT INTO expenses (
      spent_on,
      category,
      supplier,
      payment_method,
      base_amount,
      vat_amount,
      total_amount,
      note,
      created_by_profile_id
    )
    VALUES (
      p_spent_on,
      trim(p_category),
      NULLIF(trim(COALESCE(p_supplier, '')), ''),
      p_payment_method,
      ROUND(p_base_amount::numeric, 2),
      ROUND(p_vat_amount::numeric, 2),
      v_total_amount,
      NULLIF(trim(COALESCE(p_note, '')), ''),
      p_actor_profile_id
    )
    RETURNING id INTO v_expense_id;

    INSERT INTO audit_logs (actor_profile_id, entity_name, entity_id, action, diff)
    VALUES (
      p_actor_profile_id,
      'expenses',
      v_expense_id,
      'create',
      jsonb_build_object('category', trim(p_category), 'total_amount', v_total_amount)
    );
  ELSE
    UPDATE expenses
       SET spent_on = p_spent_on,
           category = trim(p_category),
           supplier = NULLIF(trim(COALESCE(p_supplier, '')), ''),
           payment_method = p_payment_method,
           base_amount = ROUND(p_base_amount::numeric, 2),
           vat_amount = ROUND(p_vat_amount::numeric, 2),
           total_amount = v_total_amount,
           note = NULLIF(trim(COALESCE(p_note, '')), ''),
           updated_at = NOW()
     WHERE id = p_expense_id
     RETURNING id INTO v_expense_id;

    IF v_expense_id IS NULL THEN
      RAISE EXCEPTION 'Gasto no encontrado';
    END IF;

    INSERT INTO audit_logs (actor_profile_id, entity_name, entity_id, action, diff)
    VALUES (
      p_actor_profile_id,
      'expenses',
      v_expense_id,
      'update',
      jsonb_build_object('category', trim(p_category), 'total_amount', v_total_amount)
    );
  END IF;

  RETURN v_expense_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION app_create_internal_notification(
  p_actor_profile_id UUID,
  p_client_id UUID,
  p_pass_id UUID,
  p_sale_id UUID,
  p_event_type TEXT,
  p_recipient TEXT,
  p_subject TEXT,
  p_body TEXT,
  p_payload JSONB
) RETURNS UUID AS $$
DECLARE
  v_notification_id UUID;
BEGIN
  IF p_event_type NOT IN ('renewal_confirmation', 'manual_note') THEN
    RAISE EXCEPTION 'Tipo de evento interno no valido';
  END IF;

  IF COALESCE(trim(COALESCE(p_body, '')), '') = '' THEN
    RAISE EXCEPTION 'El cuerpo de la notificacion es obligatorio';
  END IF;

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
    payload,
    processed_at
  )
  VALUES (
    p_client_id,
    p_pass_id,
    p_sale_id,
    'internal',
    p_event_type,
    'sent',
    NULLIF(trim(COALESCE(p_recipient, '')), ''),
    NULLIF(trim(COALESCE(p_subject, '')), ''),
    trim(p_body),
    p_payload,
    NOW()
  )
  RETURNING id INTO v_notification_id;

  INSERT INTO audit_logs (actor_profile_id, entity_name, entity_id, action, diff)
  VALUES (
    p_actor_profile_id,
    'notification_log',
    v_notification_id,
    'send_notification',
    jsonb_build_object('channel', 'internal', 'event_type', p_event_type)
  );

  RETURN v_notification_id;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION app_create_expense(UUID, UUID, DATE, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION app_create_internal_notification(UUID, UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, JSONB) TO authenticated;
