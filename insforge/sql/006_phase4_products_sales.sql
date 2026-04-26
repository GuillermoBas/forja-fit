CREATE OR REPLACE FUNCTION app_upsert_product(
  p_actor_profile_id UUID,
  p_product_id UUID,
  p_name TEXT,
  p_sku TEXT,
  p_category TEXT,
  p_price_gross NUMERIC,
  p_vat_rate NUMERIC,
  p_min_stock INTEGER,
  p_is_active BOOLEAN
) RETURNS UUID AS $$
DECLARE
  v_product_id UUID;
BEGIN
  IF COALESCE(trim(p_name), '') = '' THEN
    RAISE EXCEPTION 'El nombre del producto es obligatorio';
  END IF;

  IF COALESCE(p_price_gross, -1) < 0 THEN
    RAISE EXCEPTION 'El precio no puede ser negativo';
  END IF;

  IF COALESCE(p_vat_rate, -1) < 0 THEN
    RAISE EXCEPTION 'El IVA no puede ser negativo';
  END IF;

  IF COALESCE(p_min_stock, -1) < 0 THEN
    RAISE EXCEPTION 'El stock minimo no puede ser negativo';
  END IF;

  IF p_product_id IS NULL THEN
    INSERT INTO products (
      name,
      sku,
      category,
      price_gross,
      vat_rate,
      min_stock,
      is_active
    )
    VALUES (
      trim(p_name),
      NULLIF(trim(COALESCE(p_sku, '')), ''),
      NULLIF(trim(COALESCE(p_category, '')), ''),
      ROUND(p_price_gross::numeric, 2),
      ROUND(p_vat_rate::numeric, 2),
      p_min_stock,
      COALESCE(p_is_active, TRUE)
    )
    RETURNING id INTO v_product_id;

    INSERT INTO audit_logs (actor_profile_id, entity_name, entity_id, action, diff)
    VALUES (
      p_actor_profile_id,
      'products',
      v_product_id,
      'create',
      jsonb_build_object(
        'name', trim(p_name),
        'sku', NULLIF(trim(COALESCE(p_sku, '')), ''),
        'price_gross', ROUND(p_price_gross::numeric, 2)
      )
    );
  ELSE
    UPDATE products
       SET name = trim(p_name),
           sku = NULLIF(trim(COALESCE(p_sku, '')), ''),
           category = NULLIF(trim(COALESCE(p_category, '')), ''),
           price_gross = ROUND(p_price_gross::numeric, 2),
           vat_rate = ROUND(p_vat_rate::numeric, 2),
           min_stock = p_min_stock,
           is_active = COALESCE(p_is_active, TRUE),
           updated_at = NOW()
     WHERE id = p_product_id
     RETURNING id INTO v_product_id;

    IF v_product_id IS NULL THEN
      RAISE EXCEPTION 'Producto no encontrado';
    END IF;

    INSERT INTO audit_logs (actor_profile_id, entity_name, entity_id, action, diff)
    VALUES (
      p_actor_profile_id,
      'products',
      v_product_id,
      'update',
      jsonb_build_object(
        'name', trim(p_name),
        'sku', NULLIF(trim(COALESCE(p_sku, '')), ''),
        'price_gross', ROUND(p_price_gross::numeric, 2),
        'min_stock', p_min_stock,
        'is_active', COALESCE(p_is_active, TRUE)
      )
    );
  END IF;

  RETURN v_product_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION app_add_stock(
  p_actor_profile_id UUID,
  p_product_id UUID,
  p_quantity INTEGER
) RETURNS JSONB AS $$
DECLARE
  v_new_stock INTEGER;
BEGIN
  IF COALESCE(p_quantity, 0) <= 0 THEN
    RAISE EXCEPTION 'La cantidad debe ser mayor que cero';
  END IF;

  UPDATE products
     SET stock_on_hand = stock_on_hand + p_quantity,
         updated_at = NOW()
   WHERE id = p_product_id
   RETURNING stock_on_hand INTO v_new_stock;

  IF v_new_stock IS NULL THEN
    RAISE EXCEPTION 'Producto no encontrado';
  END IF;

  INSERT INTO audit_logs (actor_profile_id, entity_name, entity_id, action, diff)
  VALUES (
    p_actor_profile_id,
    'products',
    p_product_id,
    'update',
    jsonb_build_object('stock_delta', p_quantity, 'stock_on_hand', v_new_stock)
  );

  RETURN jsonb_build_object(
    'product_id', p_product_id,
    'stock_on_hand', v_new_stock
  );
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION app_create_sale(
  p_actor_profile_id UUID,
  p_client_id UUID,
  p_payment_method TEXT,
  p_fiscal_name TEXT,
  p_fiscal_tax_id TEXT,
  p_internal_note TEXT,
  p_items JSONB
) RETURNS JSONB AS $$
DECLARE
  v_item JSONB;
  v_product RECORD;
  v_sale_id UUID;
  v_total_gross NUMERIC(10,2) := 0;
  v_subtotal_net NUMERIC(10,2) := 0;
  v_vat_total NUMERIC(10,2) := 0;
  v_line_total NUMERIC(10,2);
  v_line_net NUMERIC(10,2);
  v_line_vat NUMERIC(10,2);
  v_qty INTEGER;
  v_product_id UUID;
  v_item_count INTEGER := 0;
  v_invoice_code TEXT;
BEGIN
  IF p_payment_method NOT IN ('cash', 'card', 'transfer', 'bizum') THEN
    RAISE EXCEPTION 'Metodo de pago no valido';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'La venta debe incluir al menos una linea';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    v_item_count := v_item_count + 1;

    IF COALESCE(v_item->>'item_type', 'product') <> 'product' THEN
      RAISE EXCEPTION 'Solo se permiten lineas de producto en create_sale';
    END IF;

    v_product_id := NULLIF(v_item->>'product_id', '')::uuid;
    v_qty := COALESCE((v_item->>'qty')::integer, 0);

    IF v_product_id IS NULL THEN
      RAISE EXCEPTION 'Falta el producto en una linea de venta';
    END IF;

    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'La cantidad debe ser mayor que cero';
    END IF;

    SELECT *
      INTO v_product
    FROM products
    WHERE id = v_product_id
    FOR UPDATE;

    IF v_product.id IS NULL OR v_product.is_active IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION 'Producto no disponible para venta';
    END IF;

    IF v_product.stock_on_hand < v_qty THEN
      RAISE EXCEPTION 'Stock insuficiente para %', v_product.name;
    END IF;

    v_line_total := ROUND((v_product.price_gross * v_qty)::numeric, 2);
    v_line_net := ROUND(v_line_total / (1 + (v_product.vat_rate / 100.0)), 2);
    v_line_vat := ROUND(v_line_total - v_line_net, 2);

    v_total_gross := v_total_gross + v_line_total;
    v_subtotal_net := v_subtotal_net + v_line_net;
    v_vat_total := v_vat_total + v_line_vat;
  END LOOP;

  IF v_item_count = 0 THEN
    RAISE EXCEPTION 'La venta debe incluir al menos una linea';
  END IF;

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
    fiscal_name,
    fiscal_tax_id,
    internal_note
  )
  VALUES (
    NOW(),
    p_client_id,
    p_actor_profile_id,
    p_payment_method,
    'posted',
    ROUND(v_subtotal_net, 2),
    ROUND(v_vat_total, 2),
    ROUND(v_total_gross, 2),
    'FF',
    NULLIF(trim(COALESCE(p_fiscal_name, '')), ''),
    NULLIF(trim(COALESCE(p_fiscal_tax_id, '')), ''),
    NULLIF(trim(COALESCE(p_internal_note, '')), '')
  )
  RETURNING id, invoice_code INTO v_sale_id, v_invoice_code;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := NULLIF(v_item->>'product_id', '')::uuid;
    v_qty := COALESCE((v_item->>'qty')::integer, 0);

    SELECT *
      INTO v_product
    FROM products
    WHERE id = v_product_id
    FOR UPDATE;

    IF v_product.stock_on_hand < v_qty THEN
      RAISE EXCEPTION 'Stock insuficiente para %', v_product.name;
    END IF;

    v_line_total := ROUND((v_product.price_gross * v_qty)::numeric, 2);

    INSERT INTO sale_items (
      sale_id,
      item_type,
      product_id,
      description_snapshot,
      qty,
      unit_price_gross,
      vat_rate,
      line_total_gross
    )
    VALUES (
      v_sale_id,
      'product',
      v_product_id,
      v_product.name,
      v_qty,
      v_product.price_gross,
      v_product.vat_rate,
      v_line_total
    );

    UPDATE products
       SET stock_on_hand = stock_on_hand - v_qty,
           updated_at = NOW()
     WHERE id = v_product_id
       AND stock_on_hand >= v_qty;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'No se pudo descontar el stock de %', v_product.name;
    END IF;
  END LOOP;

  INSERT INTO audit_logs (actor_profile_id, entity_name, entity_id, action, diff)
  VALUES (
    p_actor_profile_id,
    'sales',
    v_sale_id,
    'create',
    jsonb_build_object(
      'invoice_code', v_invoice_code,
      'payment_method', p_payment_method,
      'items_count', v_item_count,
      'total_gross', ROUND(v_total_gross, 2)
    )
  );

  RETURN jsonb_build_object(
    'sale_id', v_sale_id,
    'invoice_code', v_invoice_code,
    'total_gross', ROUND(v_total_gross, 2)
  );
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION app_void_sale(
  p_actor_profile_id UUID,
  p_sale_id UUID,
  p_reason TEXT
) RETURNS JSONB AS $$
DECLARE
  v_sale RECORD;
  v_item RECORD;
BEGIN
  SELECT *
    INTO v_sale
  FROM sales
  WHERE id = p_sale_id
  FOR UPDATE;

  IF v_sale.id IS NULL THEN
    RAISE EXCEPTION 'Venta no encontrada';
  END IF;

  IF v_sale.status = 'void' THEN
    RAISE EXCEPTION 'La venta ya esta anulada';
  END IF;

  FOR v_item IN
    SELECT *
    FROM sale_items
    WHERE sale_id = p_sale_id
  LOOP
    IF v_item.item_type = 'product' AND v_item.product_id IS NOT NULL THEN
      UPDATE products
         SET stock_on_hand = stock_on_hand + v_item.qty,
             updated_at = NOW()
       WHERE id = v_item.product_id;
    END IF;
  END LOOP;

  UPDATE sales
     SET status = 'void',
         internal_note = concat_ws(
           E'\n',
           NULLIF(internal_note, ''),
           'ANULADA: ' || trim(COALESCE(p_reason, 'Sin motivo'))
         ),
         updated_at = NOW()
   WHERE id = p_sale_id;

  INSERT INTO audit_logs (actor_profile_id, entity_name, entity_id, action, diff)
  VALUES (
    p_actor_profile_id,
    'sales',
    p_sale_id,
    'void_sale',
    jsonb_build_object('reason', NULLIF(trim(COALESCE(p_reason, '')), ''))
  );

  RETURN jsonb_build_object(
    'sale_id', p_sale_id,
    'status', 'void'
  );
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION app_upsert_product(UUID, UUID, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, INTEGER, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION app_add_stock(UUID, UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION app_create_sale(UUID, UUID, TEXT, TEXT, TEXT, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION app_void_sale(UUID, UUID, TEXT) TO authenticated;
