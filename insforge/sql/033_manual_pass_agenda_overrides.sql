DO $$
DECLARE
  v_constraint RECORD;
BEGIN
  FOR v_constraint IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'passes'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%sessions_left%'
  LOOP
    EXECUTE format('ALTER TABLE passes DROP CONSTRAINT IF EXISTS %I', v_constraint.conname);
  END LOOP;
END;
$$;

ALTER TABLE passes
  ADD CONSTRAINT passes_sessions_flexible_manual_check
    CHECK (
      (original_sessions IS NULL AND sessions_left IS NULL)
      OR
      (original_sessions BETWEEN 1 AND 30 AND sessions_left >= 0)
    );

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
  v_gym_id UUID := app_actor_gym_id(p_actor_profile_id);
  v_holder_count INTEGER := 0;
  v_pause_days INTEGER := 0;
  v_effective_sessions_left INTEGER;
BEGIN
  SELECT *
    INTO v_pass
  FROM passes
  WHERE id = p_pass_id
    AND gym_id = v_gym_id;

  IF v_pass.id IS NULL THEN
    RAISE EXCEPTION 'Bono no encontrado';
  END IF;

  SELECT *
    INTO v_pass_type
  FROM pass_types
  WHERE id = p_pass_type_id
    AND gym_id = v_gym_id;

  IF v_pass_type.id IS NULL THEN
    RAISE EXCEPTION 'Tipo de bono no valido';
  END IF;

  SELECT COUNT(*)
    INTO v_holder_count
  FROM clients
  WHERE id = ANY(COALESCE(p_holder_client_ids, ARRAY[]::UUID[]))
    AND gym_id = v_gym_id;

  IF v_holder_count <> COALESCE(array_length(p_holder_client_ids, 1), 0) THEN
    RAISE EXCEPTION 'Todos los titulares deben pertenecer al gimnasio activo';
  END IF;

  IF p_purchased_by_client_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM clients
    WHERE id = p_purchased_by_client_id
      AND gym_id = v_gym_id
  ) THEN
    RAISE EXCEPTION 'El comprador no pertenece al gimnasio activo';
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

  SELECT COALESCE(SUM(pause_days), 0)
    INTO v_pause_days
  FROM pass_pauses
  WHERE pass_id = p_pass_id
    AND gym_id = v_gym_id;

  IF v_pass_type.kind = 'session' THEN
    v_effective_sessions_left := COALESCE(
      p_sessions_left,
      v_pass.sessions_left,
      v_pass_type.sessions_total,
      0
    );

    IF v_effective_sessions_left < 0 THEN
      RAISE EXCEPTION 'El saldo de sesiones no puede ser negativo';
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
   WHERE id = p_pass_id
     AND gym_id = v_gym_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bono no encontrado';
  END IF;

  PERFORM app_replace_pass_holders(p_pass_id, p_holder_client_ids);

  INSERT INTO audit_logs (gym_id, actor_profile_id, entity_name, entity_id, action, diff)
  VALUES (
    v_gym_id,
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

GRANT EXECUTE ON FUNCTION app_update_pass(UUID, UUID, UUID, UUID[], UUID, TEXT, DATE, TEXT, INTEGER, TEXT) TO authenticated;

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
  WHERE id = p_pass_type_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'pass type not found';
  END IF;

  SELECT array_agg(client_id ORDER BY holder_order)
    INTO v_holder_client_ids
  FROM pass_holders
  WHERE pass_id = p_old_pass_id;

  IF v_holder_client_ids IS NULL OR array_length(v_holder_client_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'renewal requires at least one holder';
  END IF;

  v_primary_holder_id := v_holder_client_ids[1];
  v_price_gross := COALESCE(p_price_gross_override, v_old_pass.sold_price_gross, v_pass_type.price_gross);

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

GRANT EXECUTE ON FUNCTION app_renew_pass(UUID, UUID, UUID, TEXT, NUMERIC, DATE, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION app_upsert_calendar_session(
  p_actor_profile_id UUID,
  p_session_id UUID,
  p_trainer_profile_id UUID,
  p_pass_ids UUID[],
  p_starts_at TIMESTAMPTZ,
  p_ends_at TIMESTAMPTZ,
  p_status TEXT,
  p_notes TEXT
) RETURNS UUID AS $$
DECLARE
  v_session_id UUID;
  v_actor profiles%ROWTYPE;
  v_existing calendar_sessions%ROWTYPE;
  v_slot_session calendar_sessions%ROWTYPE;
  v_pass_count INTEGER := 0;
  v_client_ids UUID[];
  v_unique_pass_ids UUID[];
  v_merged_pass_ids UUID[];
  v_merged_client_ids UUID[];
  v_target_notes TEXT;
  v_gym_id UUID := app_actor_gym_id(p_actor_profile_id);
BEGIN
  SELECT * INTO v_actor
    FROM profiles
   WHERE id = p_actor_profile_id
     AND gym_id = v_gym_id
     AND is_active = TRUE;

  IF v_actor.id IS NULL THEN
    RAISE EXCEPTION 'Perfil operativo no encontrado';
  END IF;

  IF v_actor.role <> 'admin' AND p_trainer_profile_id <> p_actor_profile_id THEN
    RAISE EXCEPTION 'Solo admin puede gestionar agendas de otros entrenadores';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM profiles
     WHERE id = p_trainer_profile_id
       AND gym_id = v_gym_id
       AND is_active = TRUE
       AND role IN ('admin', 'trainer')
  ) THEN
    RAISE EXCEPTION 'Entrenador no valido';
  END IF;

  IF p_status NOT IN ('scheduled', 'completed', 'cancelled', 'no_show') THEN
    RAISE EXCEPTION 'Estado de sesion no valido';
  END IF;

  IF p_ends_at <= p_starts_at THEN
    RAISE EXCEPTION 'La sesion debe terminar despues de empezar';
  END IF;

  IF date_part('minute', p_starts_at) <> 0
     OR date_part('second', p_starts_at) <> 0
     OR date_part('minute', p_ends_at) <> 0
     OR date_part('second', p_ends_at) <> 0 THEN
    RAISE EXCEPTION 'La agenda solo permite horas completas';
  END IF;

  SELECT ARRAY(
    SELECT DISTINCT unnest(COALESCE(p_pass_ids, ARRAY[]::UUID[]))
  ) INTO v_unique_pass_ids;

  IF array_length(v_unique_pass_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'Selecciona al menos un bono';
  END IF;

  SELECT COUNT(*) INTO v_pass_count
    FROM passes
   WHERE id = ANY(v_unique_pass_ids)
     AND gym_id = v_gym_id;

  IF v_pass_count <> array_length(v_unique_pass_ids, 1) THEN
    RAISE EXCEPTION 'Todos los bonos seleccionados deben existir';
  END IF;

  SELECT ARRAY(
    SELECT DISTINCT ph.client_id
      FROM pass_holders ph
     WHERE ph.pass_id = ANY(v_unique_pass_ids)
       AND ph.gym_id = v_gym_id
     ORDER BY ph.client_id
  ) INTO v_client_ids;

  IF array_length(v_client_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'Los bonos seleccionados no tienen clientes titulares';
  END IF;

  IF array_length(v_client_ids, 1) > 5 THEN
    RAISE EXCEPTION 'Una franja solo puede agrupar hasta 5 clientes';
  END IF;

  IF p_session_id IS NOT NULL THEN
    SELECT * INTO v_existing
      FROM calendar_sessions
     WHERE id = p_session_id
       AND gym_id = v_gym_id
     FOR UPDATE;

    IF v_existing.id IS NULL THEN
      RAISE EXCEPTION 'Sesion no encontrada';
    END IF;

    IF v_actor.role <> 'admin' AND v_existing.trainer_profile_id <> p_actor_profile_id THEN
      RAISE EXCEPTION 'No puedes modificar citas de otro entrenador';
    END IF;
  END IF;

  SELECT * INTO v_slot_session
    FROM calendar_sessions
   WHERE trainer_profile_id = p_trainer_profile_id
     AND gym_id = v_gym_id
     AND starts_at = p_starts_at
     AND ends_at = p_ends_at
     AND status <> 'cancelled'
     AND (p_session_id IS NULL OR id <> p_session_id)
   FOR UPDATE;

  IF p_session_id IS NULL AND v_slot_session.id IS NULL THEN
    INSERT INTO calendar_sessions (
      trainer_profile_id,
      client_1_id,
      client_2_id,
      pass_id,
      starts_at,
      ends_at,
      status,
      notes,
      created_by_profile_id
    )
    VALUES (
      p_trainer_profile_id,
      v_client_ids[1],
      CASE WHEN array_length(v_client_ids, 1) >= 2 THEN v_client_ids[2] ELSE NULL END,
      v_unique_pass_ids[1],
      p_starts_at,
      p_ends_at,
      p_status,
      NULLIF(trim(COALESCE(p_notes, '')), ''),
      p_actor_profile_id
    )
    RETURNING id INTO v_session_id;

    INSERT INTO audit_logs (actor_profile_id, entity_name, entity_id, action, diff)
    VALUES (
      p_actor_profile_id,
      'calendar_sessions',
      v_session_id,
      'create',
      jsonb_build_object(
        'trainer_profile_id', p_trainer_profile_id,
        'pass_ids', v_unique_pass_ids,
        'client_ids', v_client_ids,
        'starts_at', p_starts_at,
        'ends_at', p_ends_at,
        'status', p_status,
        'manual_override', TRUE
      )
    );
  ELSIF p_session_id IS NOT NULL AND v_slot_session.id IS NULL THEN
    UPDATE calendar_sessions
       SET trainer_profile_id = p_trainer_profile_id,
           client_1_id = v_client_ids[1],
           client_2_id = CASE WHEN array_length(v_client_ids, 1) >= 2 THEN v_client_ids[2] ELSE NULL END,
           pass_id = v_unique_pass_ids[1],
           starts_at = p_starts_at,
           ends_at = p_ends_at,
           status = p_status,
           notes = NULLIF(trim(COALESCE(p_notes, '')), ''),
           updated_at = NOW()
     WHERE id = p_session_id
       AND gym_id = v_gym_id
     RETURNING id INTO v_session_id;

    IF v_session_id IS NULL THEN
      RAISE EXCEPTION 'Sesion no encontrada';
    END IF;

    INSERT INTO audit_logs (actor_profile_id, entity_name, entity_id, action, diff)
    VALUES (
      p_actor_profile_id,
      'calendar_sessions',
      v_session_id,
      'update',
      jsonb_build_object(
        'trainer_profile_id', p_trainer_profile_id,
        'pass_ids', v_unique_pass_ids,
        'client_ids', v_client_ids,
        'starts_at', p_starts_at,
        'ends_at', p_ends_at,
        'status', p_status,
        'manual_override', TRUE
      )
    );
  ELSE
    v_session_id := COALESCE(v_slot_session.id, v_existing.id);

    SELECT ARRAY(
      SELECT DISTINCT pass_id
      FROM (
        SELECT unnest(COALESCE(v_unique_pass_ids, ARRAY[]::UUID[])) AS pass_id
        UNION
        SELECT csp.pass_id
        FROM calendar_session_passes csp
        WHERE csp.session_id = v_session_id
          AND csp.gym_id = v_gym_id
        UNION
        SELECT pass_id
        FROM calendar_sessions
        WHERE id = v_session_id
          AND gym_id = v_gym_id
          AND pass_id IS NOT NULL
      ) merged_passes
      ORDER BY pass_id
    ) INTO v_merged_pass_ids;

    SELECT ARRAY(
      SELECT DISTINCT ph.client_id
      FROM pass_holders ph
      WHERE ph.pass_id = ANY(COALESCE(v_merged_pass_ids, ARRAY[]::UUID[]))
        AND ph.gym_id = v_gym_id
      ORDER BY ph.client_id
    ) INTO v_merged_client_ids;

    IF array_length(v_merged_client_ids, 1) IS NULL THEN
      RAISE EXCEPTION 'Los bonos seleccionados no tienen clientes titulares';
    END IF;

    IF array_length(v_merged_client_ids, 1) > 5 THEN
      RAISE EXCEPTION 'Una franja solo puede agrupar hasta 5 clientes';
    END IF;

    v_target_notes := NULLIF(trim(COALESCE(p_notes, '')), '');
    IF v_target_notes IS NULL THEN
      v_target_notes := NULLIF(trim(COALESCE(v_slot_session.notes, v_existing.notes, '')), '');
    END IF;

    UPDATE calendar_sessions
       SET trainer_profile_id = p_trainer_profile_id,
           client_1_id = v_merged_client_ids[1],
           client_2_id = CASE WHEN array_length(v_merged_client_ids, 1) >= 2 THEN v_merged_client_ids[2] ELSE NULL END,
           pass_id = v_merged_pass_ids[1],
           starts_at = p_starts_at,
           ends_at = p_ends_at,
           status = p_status,
           notes = v_target_notes,
           updated_at = NOW()
     WHERE id = v_session_id
       AND gym_id = v_gym_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Sesion no encontrada';
    END IF;

    DELETE FROM calendar_session_passes
     WHERE session_id = v_session_id
       AND gym_id = v_gym_id;

    INSERT INTO calendar_session_passes (session_id, pass_id)
    SELECT v_session_id, unnest(v_merged_pass_ids);

    IF p_session_id IS NOT NULL AND v_slot_session.id IS NOT NULL THEN
      DELETE FROM calendar_session_passes
       WHERE session_id = p_session_id
         AND gym_id = v_gym_id;

      DELETE FROM calendar_sessions
       WHERE id = p_session_id
         AND gym_id = v_gym_id;
    END IF;

    INSERT INTO audit_logs (actor_profile_id, entity_name, entity_id, action, diff)
    VALUES (
      p_actor_profile_id,
      'calendar_sessions',
      v_session_id,
      'update',
      jsonb_build_object(
        'trainer_profile_id', p_trainer_profile_id,
        'pass_ids', v_merged_pass_ids,
        'client_ids', v_merged_client_ids,
        'starts_at', p_starts_at,
        'ends_at', p_ends_at,
        'status', p_status,
        'merged', TRUE,
        'manual_override', TRUE,
        'merged_with_session_id', v_slot_session.id
      )
    );

    RETURN v_session_id;
  END IF;

  DELETE FROM calendar_session_passes
   WHERE session_id = v_session_id
     AND gym_id = v_gym_id;

  INSERT INTO calendar_session_passes (session_id, pass_id)
  SELECT v_session_id, unnest(v_unique_pass_ids);

  RETURN v_session_id;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION app_upsert_calendar_session(UUID, UUID, UUID, UUID[], TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION app_schedule_pass_sessions(
  p_actor_profile_id UUID,
  p_pass_id UUID,
  p_start_on DATE,
  p_entries JSONB,
  p_mode TEXT DEFAULT 'all'
) RETURNS INTEGER AS $$
DECLARE
  v_pass passes%ROWTYPE;
  v_pass_kind TEXT;
  v_sessions_needed INTEGER := 0;
  v_scheduled_count INTEGER := 0;
  v_entry_count INTEGER := 0;
  v_future_scheduled_count INTEGER := 0;
  v_available_sessions INTEGER := 0;
  v_slot RECORD;
BEGIN
  SELECT *
    INTO v_pass
  FROM passes
  WHERE id = p_pass_id;

  IF v_pass.id IS NULL THEN
    RAISE EXCEPTION 'Bono no encontrado';
  END IF;

  SELECT kind
    INTO v_pass_kind
  FROM pass_types
  WHERE id = v_pass.pass_type_id;

  IF v_pass_kind <> 'session' OR COALESCE(v_pass.original_sessions, 0) <= 0 THEN
    RAISE EXCEPTION 'Solo los bonos por sesiones admiten agenda automatica';
  END IF;

  IF p_mode NOT IN ('all', 'pending') THEN
    RAISE EXCEPTION 'El modo de agenda no es valido';
  END IF;

  IF jsonb_typeof(COALESCE(p_entries, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'El patron semanal no es valido';
  END IF;

  SELECT jsonb_array_length(COALESCE(p_entries, '[]'::jsonb))
    INTO v_entry_count;

  IF v_entry_count = 0 THEN
    RAISE EXCEPTION 'Debes indicar al menos un dia para la agenda automatica';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(COALESCE(p_entries, '[]'::jsonb)) AS entry(
      weekday INTEGER,
      hour TEXT,
      trainer_profile_id UUID
    )
    WHERE entry.weekday NOT BETWEEN 1 AND 7
      OR entry.hour !~ '^([01]\d|2[0-3]):00$'
      OR entry.trainer_profile_id IS NULL
  ) THEN
    RAISE EXCEPTION 'El patron semanal no es valido';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      SELECT
        entry.weekday,
        entry.hour,
        entry.trainer_profile_id,
        COUNT(*) AS duplicate_count
      FROM jsonb_to_recordset(COALESCE(p_entries, '[]'::jsonb)) AS entry(
        weekday INTEGER,
        hour TEXT,
        trainer_profile_id UUID
      )
      GROUP BY entry.weekday, entry.hour, entry.trainer_profile_id
      HAVING COUNT(*) > 1
    ) duplicated
  ) THEN
    RAISE EXCEPTION 'El patron semanal no puede contener filas duplicadas';
  END IF;

  IF p_mode = 'pending' THEN
    SELECT COUNT(*)
      INTO v_future_scheduled_count
    FROM calendar_session_passes csp
    JOIN calendar_sessions cs ON cs.id = csp.session_id
    WHERE csp.pass_id = p_pass_id
      AND cs.status = 'scheduled'
      AND (cs.starts_at AT TIME ZONE 'Europe/Madrid')::date >= p_start_on;

    v_available_sessions := COALESCE(v_pass.sessions_left, v_pass.original_sessions, 0);
    v_sessions_needed := GREATEST(v_available_sessions - v_future_scheduled_count, 0);

    IF v_sessions_needed = 0 THEN
      v_sessions_needed := 1;
    END IF;
  ELSE
    v_sessions_needed := v_pass.original_sessions;
  END IF;

  FOR v_slot IN
    WITH normalized_entries AS (
      SELECT DISTINCT
        entry.weekday,
        entry.hour,
        entry.trainer_profile_id
      FROM jsonb_to_recordset(COALESCE(p_entries, '[]'::jsonb)) AS entry(
        weekday INTEGER,
        hour TEXT,
        trainer_profile_id UUID
      )
    ),
    generated_slots AS (
      SELECT
        ((day_slot::date::text || ' ' || entry.hour)::timestamp AT TIME ZONE 'Europe/Madrid') AS starts_at,
        (((day_slot::date::text || ' ' || entry.hour)::timestamp + INTERVAL '1 hour') AT TIME ZONE 'Europe/Madrid') AS ends_at,
        entry.trainer_profile_id
      FROM normalized_entries entry
      CROSS JOIN generate_series(
        p_start_on::timestamp,
        (p_start_on + (v_sessions_needed * 21))::timestamp,
        INTERVAL '1 day'
      ) AS day_slot
      WHERE EXTRACT(ISODOW FROM day_slot) = entry.weekday
        AND day_slot::date >= p_start_on
    )
    SELECT starts_at, ends_at, trainer_profile_id
    FROM generated_slots
    ORDER BY starts_at
    LIMIT v_sessions_needed
  LOOP
    v_scheduled_count := v_scheduled_count + 1;

    PERFORM app_upsert_calendar_session(
      p_actor_profile_id,
      NULL,
      v_slot.trainer_profile_id,
      ARRAY[p_pass_id],
      v_slot.starts_at,
      v_slot.ends_at,
      'scheduled',
      CASE WHEN p_mode = 'pending' THEN 'Agenda forzada de sesiones pendientes' ELSE 'Auto agenda desde bono' END
    );
  END LOOP;

  IF v_scheduled_count < v_sessions_needed THEN
    RAISE EXCEPTION 'No hay suficientes franjas semanales para programar todas las sesiones';
  END IF;

  RETURN v_scheduled_count;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION app_schedule_pass_sessions(UUID, UUID, DATE, JSONB, TEXT) TO authenticated;
