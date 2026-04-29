INSERT INTO settings (business_name, reminder_days_default, default_vat_rate)
SELECT 'Trainium', 7, 21
WHERE NOT EXISTS (SELECT 1 FROM settings);

INSERT INTO pass_types (name, kind, sessions_total, price_gross, vat_rate, shared_allowed, sort_order)
VALUES
  ('Bono 8 sesiones', 'session', 8, 180.00, 21.00, TRUE, 8),
  ('Bono 10 sesiones', 'session', 10, 215.00, 21.00, TRUE, 10),
  ('Bono 12 sesiones', 'session', 12, 250.00, 21.00, TRUE, 12),
  ('Mensual', 'monthly', NULL, 165.00, 21.00, TRUE, 99)
ON CONFLICT (name) DO NOTHING;

INSERT INTO products (name, sku, category, price_gross, vat_rate, stock_on_hand, min_stock)
VALUES
  ('Proteina whey 1kg', 'WHEY-1KG', 'suplementos', 39.90, 21.00, 6, 4),
  ('Creatina 300g', 'CREATINA-300', 'suplementos', 24.90, 21.00, 3, 5),
  ('Barritas pack', 'BARRITAS-BOX', 'nutricion', 12.50, 10.00, 12, 5)
ON CONFLICT (sku) DO NOTHING;

INSERT INTO clients (first_name, last_name, email, phone, notes, joined_on, is_active)
SELECT 'Lucia', 'Moreno', 'lucia@example.com', '600111222', 'Cliente demo de fuerza', CURRENT_DATE, TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM clients WHERE email = 'lucia@example.com'
);

INSERT INTO clients (first_name, last_name, email, phone, notes, joined_on, is_active)
SELECT 'Sergio', 'Cano', 'sergio@example.com', '600333444', 'Cliente demo de manana', CURRENT_DATE, TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM clients WHERE email = 'sergio@example.com'
);

INSERT INTO clients (first_name, last_name, email, phone, notes, joined_on, is_active)
SELECT 'Marta', 'Rey', 'marta@example.com', '600555666', 'Cliente demo compartido', CURRENT_DATE, TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM clients WHERE email = 'marta@example.com'
);

-- El alta inicial del usuario admin en auth debe hacerse mediante la funcion
-- bootstrap_admin para no abrir una via paralela de privilegios.
