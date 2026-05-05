DROP FUNCTION IF EXISTS app_create_pass(UUID, UUID, UUID[], UUID, TEXT, NUMERIC, DATE, TEXT);
DROP FUNCTION IF EXISTS app_create_pass(UUID, UUID, UUID[], UUID, DATE, TEXT);
DROP FUNCTION IF EXISTS app_create_pass(UUID, UUID, UUID, UUID, UUID, DATE, TEXT);

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
AS $$
BEGIN
  RETURN app_create_pass(
    p_actor_profile_id,
    p_pass_type_id,
    p_holder_client_ids,
    p_purchased_by_client_id,
    'individual',
    p_payment_method,
    p_price_gross_override,
    p_contracted_on,
    p_notes
  );
END;
$$;

CREATE OR REPLACE FUNCTION app_create_pass(
  p_actor_profile_id UUID,
  p_pass_type_id UUID,
  p_holder_client_ids UUID[],
  p_purchased_by_client_id UUID,
  p_contracted_on DATE,
  p_notes TEXT
) RETURNS JSONB
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN app_create_pass(
    p_actor_profile_id,
    p_pass_type_id,
    p_holder_client_ids,
    p_purchased_by_client_id,
    'individual',
    'cash',
    NULL,
    p_contracted_on,
    p_notes
  );
END;
$$;

CREATE OR REPLACE FUNCTION app_create_pass(
  p_actor_profile_id UUID,
  p_pass_type_id UUID,
  p_holder_1_client_id UUID,
  p_holder_2_client_id UUID,
  p_purchased_by_client_id UUID,
  p_contracted_on DATE,
  p_notes TEXT
) RETURNS JSONB
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN app_create_pass(
    p_actor_profile_id,
    p_pass_type_id,
    ARRAY_REMOVE(ARRAY[p_holder_1_client_id, p_holder_2_client_id], NULL),
    p_purchased_by_client_id,
    'individual',
    'cash',
    NULL,
    p_contracted_on,
    p_notes
  );
END;
$$;

GRANT EXECUTE ON FUNCTION app_create_pass(UUID, UUID, UUID[], UUID, TEXT, NUMERIC, DATE, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION app_create_pass(UUID, UUID, UUID[], UUID, DATE, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION app_create_pass(UUID, UUID, UUID, UUID, UUID, DATE, TEXT) TO authenticated;
