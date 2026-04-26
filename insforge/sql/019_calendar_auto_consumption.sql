ALTER TABLE session_consumptions
  ADD COLUMN IF NOT EXISTS calendar_session_id UUID REFERENCES calendar_sessions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS consumption_source TEXT NOT NULL DEFAULT 'manual';

ALTER TABLE session_consumptions
  DROP CONSTRAINT IF EXISTS session_consumptions_consumption_source_check;

ALTER TABLE session_consumptions
  ADD CONSTRAINT session_consumptions_consumption_source_check
  CHECK (consumption_source IN ('manual', 'auto'));

CREATE INDEX IF NOT EXISTS idx_session_consumptions_calendar_session_id
  ON session_consumptions (calendar_session_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_session_consumptions_unique_session_pass
  ON session_consumptions (calendar_session_id, pass_id)
  WHERE calendar_session_id IS NOT NULL;
