# Storage setup

Crear estos buckets:

- `tickets`: PDFs de venta generados por `generate_ticket_pdf`.
- `gym-branding`: imagenes publicas de marca por gimnasio generadas desde Ajustes > Negocio.

Convención recomendada de keys:

- `{sale_id}/{timestamp}-{invoice_code}.pdf`

Guardar siempre en la base de datos tanto la `ticket_storage_key` como la `ticket_public_url` cuando existan.

Para branding, las rutas se versionan como:

```text
gyms/{gym_id}/branding/{version}/{variant}.{ext}
```

`settings.brand_assets` guarda tanto `key` como `url` por variante para que cada subdominio cargue solo las imagenes de su `gym_id`.
