ALTER TABLE passes
  ADD COLUMN IF NOT EXISTS sold_price_gross NUMERIC(10,2);

UPDATE passes p
SET sold_price_gross = COALESCE(
  (
    SELECT si.unit_price_gross
    FROM sale_items si
    WHERE si.pass_id = p.id
    ORDER BY si.created_at ASC
    LIMIT 1
  ),
  (
    SELECT pt.price_gross
    FROM pass_types pt
    WHERE pt.id = p.pass_type_id
  ),
  0
)
WHERE p.sold_price_gross IS NULL;

ALTER TABLE passes
  ALTER COLUMN sold_price_gross SET NOT NULL;

ALTER TABLE passes
  DROP CONSTRAINT IF EXISTS passes_sold_price_gross_check;

ALTER TABLE passes
  ADD CONSTRAINT passes_sold_price_gross_check
    CHECK (sold_price_gross >= 0);
