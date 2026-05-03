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

  IF v_pass.status <> 'active' THEN
    RAISE EXCEPTION 'Solo se pueden agendar sesiones sobre bonos activos';
  END IF;

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

    v_sessions_needed := GREATEST(COALESCE(v_pass.sessions_left, 0) - v_future_scheduled_count, 0);
  ELSE
    v_sessions_needed := v_pass.original_sessions;
  END IF;

  IF v_sessions_needed = 0 THEN
    RETURN 0;
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
      CASE WHEN p_mode = 'pending' THEN 'Auto agenda de sesiones pendientes' ELSE 'Auto agenda desde bono' END
    );
  END LOOP;

  IF v_scheduled_count < v_sessions_needed THEN
    RAISE EXCEPTION 'No hay suficientes franjas semanales para programar todas las sesiones';
  END IF;

  RETURN v_scheduled_count;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION app_schedule_pass_sessions(UUID, UUID, DATE, JSONB, TEXT) TO authenticated;
