ALTER TABLE job_runs
  ADD COLUMN IF NOT EXISTS run_slot TEXT NOT NULL DEFAULT '';

DROP INDEX IF EXISTS job_runs_gym_job_key_run_for_date_key;

CREATE UNIQUE INDEX IF NOT EXISTS job_runs_gym_job_key_run_for_date_slot_key
  ON job_runs (gym_id, job_key, run_for_date, run_slot);
