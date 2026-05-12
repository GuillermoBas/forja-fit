CREATE OR REPLACE FUNCTION app_auto_consume_calendar_sessions(
  p_gym_id UUID,
  p_consume_from TIMESTAMPTZ,
  p_consume_before TIMESTAMPTZ,
  p_run_for_date DATE,
  p_run_slot TEXT,
  p_now TIMESTAMPTZ DEFAULT NOW(),
  p_actor_profile_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_job_run_id UUID;
  v_existing_job RECORD;
  v_candidate RECORD;
  v_pass RECORD;
  v_consumption_client_id UUID;
  v_manual_consumption_id UUID;
  v_auto_consumed INTEGER := 0;
  v_linked_manual INTEGER := 0;
  v_updated_sessions INTEGER := 0;
  v_skipped INTEGER := 0;
  v_candidates INTEGER := 0;
  v_consumed_for_session BOOLEAN;
BEGIN
  IF p_gym_id IS NULL THEN
    RAISE EXCEPTION 'Gimnasio obligatorio';
  END IF;

  IF p_consume_from IS NULL OR p_consume_before IS NULL OR p_consume_from >= p_consume_before THEN
    RAISE EXCEPTION 'La ventana de consumo no es valida';
  END IF;

  IF COALESCE(p_run_slot, '') = '' THEN
    RAISE EXCEPTION 'Slot de ejecucion obligatorio';
  END IF;

  INSERT INTO job_runs (gym_id, job_key, run_for_date, run_slot, status, details)
  VALUES (
    p_gym_id,
    'auto_consume_calendar_sessions',
    p_run_for_date,
    p_run_slot,
    'started',
    jsonb_build_object(
      'mode', 'hourly',
      'run_slot', p_run_slot,
      'consume_from', p_consume_from,
      'consume_before', p_consume_before
    )
  )
  ON CONFLICT (gym_id, job_key, run_for_date, run_slot) DO NOTHING
  RETURNING id INTO v_job_run_id;

  IF v_job_run_id IS NULL THEN
    SELECT id, status, details
      INTO v_existing_job
    FROM job_runs
    WHERE gym_id = p_gym_id
      AND job_key = 'auto_consume_calendar_sessions'
      AND run_for_date = p_run_for_date
      AND run_slot = p_run_slot;

    IF v_existing_job.id IS NULL THEN
      RAISE EXCEPTION 'No se pudo recuperar la ejecucion del job';
    END IF;

    IF v_existing_job.status <> 'failed' THEN
      RETURN jsonb_build_object(
        'ok', true,
        'skipped', true,
        'reason', 'already_run',
        'runForDate', p_run_for_date,
        'runSlot', p_run_slot
      );
    END IF;

    v_job_run_id := v_existing_job.id;

    UPDATE job_runs
       SET status = 'started',
           details = jsonb_build_object(
             'mode', 'hourly',
             'run_slot', p_run_slot,
             'consume_from', p_consume_from,
             'consume_before', p_consume_before,
             'retried_failed_job', true,
             'previous_details', v_existing_job.details
           ),
           updated_at = p_now
     WHERE id = v_job_run_id
       AND gym_id = p_gym_id;
  END IF;

  FOR v_candidate IN
    SELECT DISTINCT
      cs.id AS session_id,
      cs.trainer_profile_id,
      cs.client_1_id,
      cs.client_2_id,
      cs.starts_at,
      cs.ends_at,
      cs.status AS session_status,
      COALESCE(csp.pass_id, cs.pass_id) AS pass_id
    FROM calendar_sessions cs
    LEFT JOIN calendar_session_passes csp
      ON csp.gym_id = cs.gym_id
     AND csp.session_id = cs.id
    WHERE cs.gym_id = p_gym_id
      AND cs.status IN ('scheduled', 'completed')
      AND cs.ends_at > p_consume_from
      AND cs.ends_at <= p_consume_before
      AND COALESCE(csp.pass_id, cs.pass_id) IS NOT NULL
    ORDER BY cs.ends_at ASC
  LOOP
    v_candidates := v_candidates + 1;
    v_consumed_for_session := FALSE;
    v_consumption_client_id := NULL;
    v_manual_consumption_id := NULL;

    IF EXISTS (
      SELECT 1
      FROM session_consumptions sc
      WHERE sc.gym_id = p_gym_id
        AND sc.calendar_session_id = v_candidate.session_id
        AND sc.pass_id = v_candidate.pass_id
    ) THEN
      v_consumed_for_session := TRUE;
    ELSE
      SELECT p.id, p.status, p.sessions_left, pt.kind
        INTO v_pass
      FROM passes p
      JOIN pass_types pt
        ON pt.id = p.pass_type_id
       AND pt.gym_id = p.gym_id
      WHERE p.gym_id = p_gym_id
        AND p.id = v_candidate.pass_id;

      IF v_pass.id IS NULL
        OR v_pass.kind <> 'session'
        OR v_pass.status <> 'active'
        OR COALESCE(v_pass.sessions_left, 0) <= 0 THEN
        v_skipped := v_skipped + 1;
      ELSE
        SELECT ph.client_id
          INTO v_consumption_client_id
        FROM pass_holders ph
        WHERE ph.gym_id = p_gym_id
          AND ph.pass_id = v_candidate.pass_id
          AND ph.client_id IN (v_candidate.client_1_id, v_candidate.client_2_id)
        ORDER BY CASE
          WHEN ph.client_id = v_candidate.client_1_id THEN 1
          WHEN ph.client_id = v_candidate.client_2_id THEN 2
          ELSE 3
        END
        LIMIT 1;

        IF v_consumption_client_id IS NULL THEN
          SELECT ph.client_id
            INTO v_consumption_client_id
          FROM pass_holders ph
          WHERE ph.gym_id = p_gym_id
            AND ph.pass_id = v_candidate.pass_id
          ORDER BY ph.holder_order ASC NULLS LAST, ph.created_at ASC
          LIMIT 1;
        END IF;

        IF v_consumption_client_id IS NULL THEN
          v_skipped := v_skipped + 1;
        ELSE
          SELECT sc.id
            INTO v_manual_consumption_id
          FROM session_consumptions sc
          WHERE sc.gym_id = p_gym_id
            AND sc.pass_id = v_candidate.pass_id
            AND sc.calendar_session_id IS NULL
            AND sc.consumed_at >= v_candidate.starts_at - INTERVAL '6 hours'
            AND sc.consumed_at <= v_candidate.ends_at + INTERVAL '12 hours'
          ORDER BY sc.consumed_at ASC
          LIMIT 1;

          IF v_manual_consumption_id IS NOT NULL THEN
            UPDATE session_consumptions
               SET calendar_session_id = v_candidate.session_id,
                   consumption_source = COALESCE(NULLIF(consumption_source, ''), 'manual')
             WHERE id = v_manual_consumption_id
               AND gym_id = p_gym_id
               AND calendar_session_id IS NULL;

            IF FOUND THEN
              v_linked_manual := v_linked_manual + 1;
              v_consumed_for_session := TRUE;
            ELSE
              v_skipped := v_skipped + 1;
            END IF;
          ELSE
            BEGIN
              INSERT INTO session_consumptions (
                gym_id,
                pass_id,
                client_id,
                consumed_at,
                recorded_by_profile_id,
                notes,
                calendar_session_id,
                consumption_source
              )
              VALUES (
                p_gym_id,
                v_candidate.pass_id,
                v_consumption_client_id,
                v_candidate.ends_at,
                v_candidate.trainer_profile_id,
                'Consumo automatico desde agenda',
                v_candidate.session_id,
                'auto'
              );

              v_auto_consumed := v_auto_consumed + 1;
              v_consumed_for_session := TRUE;
            EXCEPTION
              WHEN unique_violation THEN
                v_skipped := v_skipped + 1;
              WHEN OTHERS THEN
                v_skipped := v_skipped + 1;
            END;
          END IF;
        END IF;
      END IF;
    END IF;

    IF v_consumed_for_session AND v_candidate.session_status = 'scheduled' THEN
      UPDATE calendar_sessions
         SET status = 'completed',
             updated_at = p_now
       WHERE id = v_candidate.session_id
         AND gym_id = p_gym_id
         AND status = 'scheduled';

      IF FOUND THEN
        v_updated_sessions := v_updated_sessions + 1;
      END IF;
    END IF;
  END LOOP;

  UPDATE job_runs
     SET status = 'completed',
         details = jsonb_build_object(
           'mode', 'hourly',
           'run_slot', p_run_slot,
           'consume_from', p_consume_from,
           'consume_before', p_consume_before,
           'candidates', v_candidates,
           'auto_consumed', v_auto_consumed,
           'linked_manual', v_linked_manual,
           'updated_sessions', v_updated_sessions,
           'skipped', v_skipped
         ),
         updated_at = p_now
   WHERE id = v_job_run_id
     AND gym_id = p_gym_id;

  IF p_actor_profile_id IS NOT NULL THEN
    INSERT INTO audit_logs (
      gym_id,
      actor_profile_id,
      entity_name,
      entity_id,
      action,
      diff
    )
    VALUES (
      p_gym_id,
      p_actor_profile_id,
      'job_runs',
      v_job_run_id,
      'update',
      jsonb_build_object(
        'candidates', v_candidates,
        'auto_consumed', v_auto_consumed,
        'linked_manual', v_linked_manual,
        'updated_sessions', v_updated_sessions,
        'skipped', v_skipped
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'candidates', v_candidates,
    'autoConsumed', v_auto_consumed,
    'linkedManual', v_linked_manual,
    'updatedSessions', v_updated_sessions,
    'skipped', v_skipped,
    'runSlot', p_run_slot
  );
EXCEPTION
  WHEN OTHERS THEN
    IF v_job_run_id IS NOT NULL THEN
      UPDATE job_runs
         SET status = 'failed',
             details = jsonb_build_object('error', SQLERRM),
             updated_at = p_now
       WHERE id = v_job_run_id
         AND gym_id = p_gym_id;
    END IF;

    RAISE;
END;
$$ LANGUAGE plpgsql;
