ALTER TABLE passes
  DROP CONSTRAINT IF EXISTS passes_check1;

ALTER TABLE passes
  ADD CONSTRAINT passes_expiry_floor_check
  CHECK (expires_on >= contracted_on + 30);
