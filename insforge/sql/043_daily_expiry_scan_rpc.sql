CREATE OR REPLACE FUNCTION app_prepare_daily_expiry_scan(
  p_gym_id UUID,
  p_run_for_date DATE,
  p_actor_profile_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_job_run_id UUID;
  v_existing_job RECORD;
  v_d7_date DATE := p_run_for_date + 7;
  v_active_paused_pass_ids UUID[] := ARRAY[]::UUID[];
  v_resumed_active INTEGER := 0;
  v_resumed_out_of_sessions INTEGER := 0;
  v_expired INTEGER := 0;
  v_d7_passes JSONB := '[]'::JSONB;
  v_d0_passes JSONB := '[]'::JSONB;
BEGIN
  IF p_gym_id IS NULL THEN
    RAISE EXCEPTION 'Gimnasio obligatorio';
  END IF;

  IF p_run_for_date IS NULL THEN
    RAISE EXCEPTION 'Fecha de ejecucion obligatoria';
  END IF;

  IF p_run_for_date > (NOW() AT TIME ZONE 'Europe/Madrid')::DATE THEN
    RAISE EXCEPTION 'El job diario no admite fechas futuras';
  END IF;

  INSERT INTO job_runs (gym_id, job_key, run_for_date, run_slot, status, details)
  VALUES (
    p_gym_id,
    'daily_expiry_scan',
    p_run_for_date,
    '',
    'started',
    jsonb_build_object('timezone', 'Europe/Madrid')
  )
  ON CONFLICT (gym_id, job_key, run_for_date, run_slot) DO NOTHING
  RETURNING id INTO v_job_run_id;

  IF v_job_run_id IS NULL THEN
    SELECT id, status, details
      INTO v_existing_job
    FROM job_runs
    WHERE gym_id = p_gym_id
      AND job_key = 'daily_expiry_scan'
      AND run_for_date = p_run_for_date
      AND run_slot = '';

    IF v_existing_job.id IS NULL THEN
      RAISE EXCEPTION 'No se pudo recuperar la ejecucion del job diario';
    END IF;

    IF v_existing_job.status <> 'failed' THEN
      INSERT INTO audit_logs (gym_id, actor_profile_id, entity_name, entity_id, action, diff)
      VALUES (
        p_gym_id,
        p_actor_profile_id,
        'job_runs',
        NULL,
        'update',
        jsonb_build_object(
          'job_key', 'daily_expiry_scan',
          'run_for_date', p_run_for_date,
          'skipped', TRUE,
          'reason', 'already_run'
        )
      );

      RETURN jsonb_build_object(
        'ok', TRUE,
        'skipped', TRUE,
        'reason', 'already_run',
        'runForDate', p_run_for_date
      );
    END IF;

    v_job_run_id := v_existing_job.id;

    UPDATE job_runs
       SET status = 'started',
           details = jsonb_build_object(
             'timezone', 'Europe/Madrid',
             'retried_failed_job', TRUE,
             'previous_details', v_existing_job.details
           ),
           updated_at = NOW()
     WHERE id = v_job_run_id
       AND gym_id = p_gym_id;
  END IF;

  SELECT COALESCE(array_agg(pass_id), ARRAY[]::UUID[])
    INTO v_active_paused_pass_ids
  FROM pass_pauses
  WHERE gym_id = p_gym_id
    AND starts_on <= p_run_for_date
    AND ends_on >= p_run_for_date;

  WITH resumed AS (
    UPDATE passes p
       SET status = 'active',
           updated_at = NOW()
     WHERE p.gym_id = p_gym_id
       AND p.status = 'paused'
       AND NOT p.id = ANY(v_active_paused_pass_ids)
       AND (p.sessions_left IS NULL OR p.sessions_left > 0)
     RETURNING p.id
  )
  SELECT COUNT(*) INTO v_resumed_active FROM resumed;

  WITH resumed AS (
    UPDATE passes p
       SET status = 'out_of_sessions',
           updated_at = NOW()
     WHERE p.gym_id = p_gym_id
       AND p.status = 'paused'
       AND NOT p.id = ANY(v_active_paused_pass_ids)
       AND p.sessions_left IS NOT NULL
       AND p.sessions_left <= 0
     RETURNING p.id
  )
  SELECT COUNT(*) INTO v_resumed_out_of_sessions FROM resumed;

  SELECT COALESCE(jsonb_agg(to_jsonb(pass_row)), '[]'::JSONB)
    INTO v_d7_passes
  FROM (
    SELECT id, pass_type_id, expires_on, sessions_left, status
    FROM passes
    WHERE gym_id = p_gym_id
      AND expires_on = v_d7_date
      AND status IN ('active', 'out_of_sessions')
      AND NOT id = ANY(v_active_paused_pass_ids)
      AND (sessions_left IS NULL OR sessions_left > 0)
    ORDER BY expires_on ASC, created_at ASC
  ) pass_row;

  SELECT COALESCE(jsonb_agg(to_jsonb(pass_row)), '[]'::JSONB)
    INTO v_d0_passes
  FROM (
    SELECT id, pass_type_id, expires_on, sessions_left, status
    FROM passes
    WHERE gym_id = p_gym_id
      AND expires_on = p_run_for_date
      AND status IN ('active', 'out_of_sessions')
      AND NOT id = ANY(v_active_paused_pass_ids)
      AND (sessions_left IS NULL OR sessions_left > 0)
    ORDER BY expires_on ASC, created_at ASC
  ) pass_row;

  WITH expired AS (
    UPDATE passes p
       SET status = 'expired',
           updated_at = NOW()
     WHERE p.gym_id = p_gym_id
       AND p.expires_on < p_run_for_date
       AND p.status IN ('active', 'out_of_sessions')
       AND NOT p.id = ANY(v_active_paused_pass_ids)
     RETURNING p.id
  )
  SELECT COUNT(*) INTO v_expired FROM expired;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'jobRunId', v_job_run_id,
    'runForDate', p_run_for_date,
    'd7Passes', v_d7_passes,
    'd0Passes', v_d0_passes,
    'summary', jsonb_build_object(
      'd7Candidates', jsonb_array_length(v_d7_passes),
      'd0Candidates', jsonb_array_length(v_d0_passes),
      'sent', 0,
      'skipped', 0,
      'failed', 0,
      'expired', v_expired,
      'resumed', v_resumed_active + v_resumed_out_of_sessions
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION app_finish_daily_expiry_scan(
  p_gym_id UUID,
  p_job_run_id UUID,
  p_actor_profile_id UUID DEFAULT NULL,
  p_summary JSONB DEFAULT '{}'::JSONB,
  p_error TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_status TEXT := CASE WHEN p_error IS NULL OR p_error = '' THEN 'completed' ELSE 'failed' END;
  v_details JSONB := CASE
    WHEN p_error IS NULL OR p_error = '' THEN COALESCE(p_summary, '{}'::JSONB)
    ELSE jsonb_build_object('error', p_error)
  END;
BEGIN
  IF p_gym_id IS NULL OR p_job_run_id IS NULL THEN
    RAISE EXCEPTION 'Gimnasio y job obligatorios';
  END IF;

  UPDATE job_runs
     SET status = v_status,
         details = v_details,
         updated_at = NOW()
   WHERE id = p_job_run_id
     AND gym_id = p_gym_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job diario no encontrado';
  END IF;

  INSERT INTO audit_logs (gym_id, actor_profile_id, entity_name, entity_id, action, diff)
  VALUES (
    p_gym_id,
    p_actor_profile_id,
    'job_runs',
    p_job_run_id,
    'update',
    v_details || jsonb_build_object('status', v_status)
  );

  RETURN jsonb_build_object('ok', TRUE, 'status', v_status, 'jobRunId', p_job_run_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
