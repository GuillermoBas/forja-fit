# Storage setup

Crear un bucket llamado `tickets` para almacenar los PDFs de venta generados por `generate_ticket_pdf`.

Convención recomendada de keys:

- `{sale_id}/{timestamp}-{invoice_code}.pdf`

Guardar siempre en la base de datos tanto la `ticket_storage_key` como la `ticket_public_url` cuando existan.
