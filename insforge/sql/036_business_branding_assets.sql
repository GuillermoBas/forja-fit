ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS brand_asset_version TEXT,
  ADD COLUMN IF NOT EXISTS brand_assets JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE settings
   SET brand_assets = '{}'::jsonb
 WHERE brand_assets IS NULL;
