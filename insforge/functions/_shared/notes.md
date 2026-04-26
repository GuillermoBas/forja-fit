# Notas de implementación

- `bootstrap_admin`: solo debe funcionar cuando no exista ningún perfil admin.
- `create_pass`: la caducidad se calcula en servidor a partir de `purchased_on + 30 días`.
- `consume_session`: nunca debe dejar `sessions_left < 0`.
- `pause_pass`: aplicar máximo una pausa por mes y máximo 7 días.
- `renew_pass`: debe crear venta, nuevo bono, enlace `renewed_from_pass_id` y notificación interna en una sola transacción.
- `add_stock`: solo admin.
- `create_sale`: si incluye productos, decrementar stock dentro de la misma transacción.
- `void_sale`: solo admin y con auditoría.
- `run_daily_expiry_scan`: insertar primero en `job_runs` y fallar si ya existe la fecha.
