CREATE OR REPLACE FUNCTION app_reduce_stock(
  p_actor_profile_id UUID,
  p_product_id UUID,
  p_quantity INTEGER,
  p_reason TEXT
) RETURNS JSONB AS $$
DECLARE
  v_current_stock INTEGER;
  v_new_stock INTEGER;
BEGIN
  IF COALESCE(p_quantity, 0) <= 0 THEN
    RAISE EXCEPTION 'La cantidad a reducir debe ser mayor que cero';
  END IF;

  SELECT stock_on_hand
    INTO v_current_stock
  FROM products
  WHERE id = p_product_id
  FOR UPDATE;

  IF v_current_stock IS NULL THEN
    RAISE EXCEPTION 'Producto no encontrado';
  END IF;

  IF v_current_stock < p_quantity THEN
    RAISE EXCEPTION 'No puedes reducir mas stock del disponible';
  END IF;

  UPDATE products
     SET stock_on_hand = stock_on_hand - p_quantity,
         updated_at = NOW()
   WHERE id = p_product_id
   RETURNING stock_on_hand INTO v_new_stock;

  INSERT INTO audit_logs (actor_profile_id, entity_name, entity_id, action, diff)
  VALUES (
    p_actor_profile_id,
    'products',
    p_product_id,
    'update',
    jsonb_build_object(
      'stock_delta', -p_quantity,
      'stock_on_hand', v_new_stock,
      'reason', NULLIF(trim(COALESCE(p_reason, '')), '')
    )
  );

  RETURN jsonb_build_object(
    'product_id', p_product_id,
    'stock_on_hand', v_new_stock
  );
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION app_delete_product(
  p_actor_profile_id UUID,
  p_product_id UUID
) RETURNS UUID AS $$
DECLARE
  v_product products%ROWTYPE;
  v_sale_item_count INTEGER := 0;
BEGIN
  SELECT *
    INTO v_product
  FROM products
  WHERE id = p_product_id;

  IF v_product.id IS NULL THEN
    RAISE EXCEPTION 'Producto no encontrado';
  END IF;

  SELECT COUNT(*)
    INTO v_sale_item_count
  FROM sale_items
  WHERE product_id = p_product_id;

  IF v_sale_item_count > 0 THEN
    RAISE EXCEPTION 'No se puede borrar el producto porque ya tiene ventas asociadas';
  END IF;

  DELETE FROM products
  WHERE id = p_product_id;

  INSERT INTO audit_logs (actor_profile_id, entity_name, entity_id, action, diff)
  VALUES (
    p_actor_profile_id,
    'products',
    p_product_id,
    'delete',
    jsonb_build_object(
      'name', v_product.name,
      'sku', v_product.sku,
      'stock_on_hand', v_product.stock_on_hand
    )
  );

  RETURN p_product_id;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION app_reduce_stock(UUID, UUID, INTEGER, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION app_delete_product(UUID, UUID) TO authenticated;
