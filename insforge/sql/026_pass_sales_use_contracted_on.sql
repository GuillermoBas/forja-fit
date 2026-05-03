CREATE OR REPLACE FUNCTION app_create_pass(
  p_actor_profile_id UUID,
  p_pass_type_id UUID,
  p_holder_client_ids UUID[],
  p_purchased_by_client_id UUID,
  p_payment_method TEXT,
  p_price_gross_override NUMERIC,
  p_contracted_on DATE,
  p_notes TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pass_type pass_types%ROWTYPE;
  v_pass_id UUID;
  v_sale_id UUID;
  v_primary_holder_id UUID;
  v_price_gross NUMERIC(10,2);
  v_subtotal_net NUMERIC(10,2);
  v_vat_total NUMERIC(10,2);
BEGIN
  IF p_actor_profile_id IS NULL THEN
    RAISE EXCEPTION 'actor profile required';
  END IF;

  IF p_holder_client_ids IS NULL OR array_length(p_holder_client_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'at least one holder is required';
  END IF;

  IF array_length(p_holder_client_ids, 1) > 5 THEN
    RAISE EXCEPTION 'shared passes support up to 5 holders';
  END IF;

  SELECT *
    INTO v_pass_type
  FROM pass_types
  WHERE id = p_pass_type_id
    AND is_active = TRUE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'pass type not found or inactive';
  END IF;

  v_primary_holder_id := COALESCE(p_purchased_by_client_id, p_holder_client_ids[1]);
  v_price_gross := COALESCE(p_price_gross_override, v_pass_type.price_gross);

  IF v_price_gross < 0 THEN
    RAISE EXCEPTION 'price must be positive';
  END IF;

  INSERT INTO passes (
    pass_type_id,
    purchased_by_client_id,
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
    v_primary_holder_id,
    p_contracted_on,
    calculate_pass_expiry(v_pass_type.kind, p_contracted_on),
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
    line_total_gross
  )
  VALUES (
    v_sale_id,
    'pass',
    v_pass_id,
    v_pass_type.name,
    1,
    v_price_gross,
    v_price_gross
  );

  INSERT INTO audit_logs (
    actor_profile_id,
    entity_name,
    entity_id,
    action,
    diff
  )
  VALUES (
    p_actor_profile_id,
    'passes',
    v_pass_id,
    'create',
    jsonb_build_object(
      'pass_type_id', p_pass_type_id,
      'holder_client_ids', p_holder_client_ids,
      'purchased_by_client_id', v_primary_holder_id,
      'payment_method', p_payment_method,
      'sold_price_gross', v_price_gross,
      'contracted_on', p_contracted_on
    )
  );

  RETURN jsonb_build_object(
    'pass_id', v_pass_id,
    'sale_id', v_sale_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION app_renew_pass(
  p_actor_profile_id UUID,
  p_old_pass_id UUID,
  p_pass_type_id UUID,
  p_payment_method TEXT,
  p_price_gross_override NUMERIC,
  p_contracted_on DATE,
  p_notes TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_old_pass passes%ROWTYPE;
  v_pass_type pass_types%ROWTYPE;
  v_new_pass_id UUID;
  v_sale_id UUID;
  v_holder_client_ids UUID[];
  v_primary_holder_id UUID;
  v_price_gross NUMERIC(10,2);
  v_subtotal_net NUMERIC(10,2);
  v_vat_total NUMERIC(10,2);
BEGIN
  IF p_actor_profile_id IS NULL THEN
    RAISE EXCEPTION 'actor profile required';
  END IF;

  SELECT *
    INTO v_old_pass
  FROM passes
  WHERE id = p_old_pass_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'pass not found';
  END IF;

  SELECT *
    INTO v_pass_type
  FROM pass_types
  WHERE id = p_pass_type_id
    AND is_active = TRUE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'pass type not found or inactive';
  END IF;

  SELECT array_agg(client_id ORDER BY holder_order), MIN(client_id)
    INTO v_holder_client_ids, v_primary_holder_id
  FROM pass_holders
  WHERE pass_id = p_old_pass_id;

  IF v_holder_client_ids IS NULL OR array_length(v_holder_client_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'renewal requires at least one holder';
  END IF;

  v_price_gross := COALESCE(p_price_gross_override, v_pass_type.price_gross);

  IF v_price_gross < 0 THEN
    RAISE EXCEPTION 'price must be positive';
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
    line_total_gross
  )
  VALUES (
    v_sale_id,
    'pass',
    v_new_pass_id,
    v_pass_type.name,
    1,
    v_price_gross,
    v_price_gross
  );

  INSERT INTO notification_log (
    client_id,
    pass_id,
    channel,
    recipient,
    subject,
    body,
    event_type,
    status
  )
  VALUES (
    v_primary_holder_id,
    v_new_pass_id,
    'internal',
    'staff',
    'Renovacion confirmada',
    format('Bono renovado: %s. Caduca el %s.', v_pass_type.name, calculate_pass_expiry(v_pass_type.kind, p_contracted_on)),
    'renewal_confirmation',
    'queued'
  );

  INSERT INTO audit_logs (
    actor_profile_id,
    entity_name,
    entity_id,
    action,
    diff
  )
  VALUES (
    p_actor_profile_id,
    'passes',
    v_new_pass_id,
    'renew',
    jsonb_build_object(
      'renewed_from_pass_id', p_old_pass_id,
      'pass_type_id', p_pass_type_id,
      'holder_client_ids', v_holder_client_ids,
      'payment_method', p_payment_method,
      'sold_price_gross', v_price_gross,
      'contracted_on', p_contracted_on
    )
  );

  RETURN jsonb_build_object(
    'pass_id', v_new_pass_id,
    'sale_id', v_sale_id
  );
END;
$$;

WITH pass_sale_targets AS (
  SELECT DISTINCT
    s.id AS sale_id,
    ((p.contracted_on::timestamp + TIME '12:00') AT TIME ZONE 'Europe/Madrid') AS target_sold_at
  FROM sales s
  INNER JOIN sale_items si
    ON si.sale_id = s.id
   AND si.item_type = 'pass'
   AND si.pass_id IS NOT NULL
  INNER JOIN passes p
    ON p.id = si.pass_id
),
updated_sales AS (
  UPDATE sales s
     SET sold_at = pst.target_sold_at,
         updated_at = NOW()
    FROM pass_sale_targets pst
   WHERE s.id = pst.sale_id
     AND s.sold_at IS DISTINCT FROM pst.target_sold_at
  RETURNING s.id, s.sold_at
)
INSERT INTO audit_logs (
  actor_profile_id,
  entity_name,
  entity_id,
  action,
  diff
)
SELECT
  NULL,
  'sales',
  us.id,
  'update',
  jsonb_build_object(
    'source', 'migration_026_pass_sales_use_contracted_on',
    'sold_at', us.sold_at
  )
FROM updated_sales us;
