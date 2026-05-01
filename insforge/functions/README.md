# InsForge Functions

Las funciones sensibles se modelan como operaciones pequeñas y orientadas a una sola acción de negocio. Todas deben:

- validar autenticación y rol
- validar inputs en servidor
- ejecutar writes transaccionales
- registrar `audit_logs` en acciones sensibles
- devolver errores estructurados

Funciones previstas:

- `bootstrap_admin`
- `create_staff_user`
- `upsert_client`
- `delete_client`
- `upsert_pass_type`
- `delete_pass_type`
- `create_pass`
- `update_pass`
- `delete_pass`
- `consume_session`
- `pause_pass`
- `renew_pass`
- `upsert_product`
- `add_stock`
- `reduce_stock`
- `delete_product`
- `create_sale`
- `void_sale`
- `create_expense`
- `upsert_calendar_session`
- `delete_calendar_session`
- `cancel_client_calendar_session`
- `auto_consume_calendar_sessions`
- `update_profile_calendar_color`
- `run_daily_expiry_scan`
- `send_expiry_email`
- `create_internal_notification`
- `generate_ticket_pdf`
