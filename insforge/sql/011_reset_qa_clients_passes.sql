BEGIN;

CREATE TEMP TABLE qa_client_ids ON COMMIT DROP AS
SELECT id
FROM clients;

CREATE TEMP TABLE qa_pass_ids ON COMMIT DROP AS
SELECT id
FROM passes;

CREATE TEMP TABLE qa_sale_ids ON COMMIT DROP AS
SELECT DISTINCT s.id
FROM sales s
LEFT JOIN sale_items si ON si.sale_id = s.id
WHERE s.client_id IN (SELECT id FROM qa_client_ids)
   OR si.pass_id IN (SELECT id FROM qa_pass_ids);

DELETE FROM notification_log
WHERE client_id IN (SELECT id FROM qa_client_ids)
   OR pass_id IN (SELECT id FROM qa_pass_ids)
   OR sale_id IN (SELECT id FROM qa_sale_ids);

DELETE FROM session_consumptions
WHERE pass_id IN (SELECT id FROM qa_pass_ids);

DELETE FROM pass_pauses
WHERE pass_id IN (SELECT id FROM qa_pass_ids);

DELETE FROM calendar_sessions
WHERE client_1_id IN (SELECT id FROM qa_client_ids)
   OR client_2_id IN (SELECT id FROM qa_client_ids)
   OR pass_id IN (SELECT id FROM qa_pass_ids);

DELETE FROM sale_items
WHERE sale_id IN (SELECT id FROM qa_sale_ids);

DELETE FROM sales
WHERE id IN (SELECT id FROM qa_sale_ids);

DELETE FROM pass_holders
WHERE pass_id IN (SELECT id FROM qa_pass_ids);

DELETE FROM passes
WHERE id IN (SELECT id FROM qa_pass_ids);

DELETE FROM audit_logs
WHERE
  (entity_name = 'clients' AND entity_id IN (SELECT id FROM qa_client_ids))
  OR (entity_name = 'passes' AND entity_id IN (SELECT id FROM qa_pass_ids))
  OR (entity_name = 'pass_pauses')
  OR (entity_name = 'session_consumptions')
  OR (entity_name = 'sales' AND entity_id IN (SELECT id FROM qa_sale_ids))
  OR (entity_name = 'notification_log')
  OR (entity_name = 'calendar_sessions');

DELETE FROM clients
WHERE id IN (SELECT id FROM qa_client_ids);

COMMIT;
