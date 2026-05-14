# Trainium

Aplicacion pequena de gestion para gimnasios, estudios de entrenamiento personal y entrenadores. Esta construida como una unica app Next.js con InsForge como backend para autenticacion, base de datos, funciones, almacenamiento y despliegue.

## Phase 2

La Fase 2 anade un portal de cliente separado bajo `/cliente/*` sin romper la app operativa de staff existente. Los roles de staff siguen siendo solo `admin` y `trainer`; el cliente del portal no cuenta como rol de staff.

Para el asistente de nutricion, el objetivo de modelo en produccion es `google/gemini-2.5-flash-lite`. Antes de activar comportamiento productivo, hay que verificar su disponibilidad en el backend mediante `GET /api/ai/models` o el MCP `get-backend-metadata`.

Estado actual de Fase 2, Fase 0:
- verificado que `google/gemini-2.5-flash-lite` esta disponible en el backend enlazado
- anadido informe admin de calidad de emails para preparar el claim del portal sin tocar aun el comportamiento del staff app
- pendiente la migracion de tablas del portal y nutricion antes de construir `/cliente/*`

Estado actual de Fase 2, Fase 1:
- anadido el esquema `client_portal_accounts` con claim controlado y auditoria de `portal_claim` y `portal_login`
- anadidas las rutas `/cliente/login`, `/cliente/registro` y `/cliente/recuperar-clave`
- el login del portal ya soporta email/password y Google OAuth sin reutilizar la sesion del staff
- `/cliente/dashboard` queda solo como placeholder tecnico hasta la siguiente fase

Estado actual de Fase 2, Fase 2:
- `/cliente/dashboard` queda como Actividad y muestra metricas, grafica semanal, bonos activos e historial reciente
- `/cliente/actividad` redirige a Actividad para no romper enlaces antiguos
- `/cliente/agenda` ya ofrece vistas de semana y mes, solo muestra sesiones propias y permite cancelar una sesion programada con mas de 24 horas de antelacion
- `/cliente/ajustes` ya permite editar el telefono mediante Function sin exponer escritura directa desde cliente
- los bonos compartidos se muestran sin revelar otros titulares, usando `Otro titular`

Estado actual de Fase 2, Fase 3:
- anadidas las tablas `client_nutrition_profiles`, `nutrition_threads`, `nutrition_messages` y `nutrition_usage_events`
- `/cliente/nutricion` ya ofrece chat persistente con hilo activo por cliente
- el acceso rapido flotante al asistente aparece en todas las pantallas autenticadas del portal cliente y abre un modal responsive a pantalla completa
- la configuracion de aplicacion `nutrition_assistant_v1` usa el modelo verificado `google/gemini-2.5-flash-lite` y onboarding inicial por chat

Estado actual de Fase 2, Fase 4:
- la memoria nutricional persistente ya guarda datos clave como altura, peso, objetivo, comidas al dia, preferencias y restricciones
- el asistente ya monta contexto acotado con memoria, resumen reciente de entrenamiento, rolling summary y ventana corta de mensajes
- se han activado cuotas de 20 mensajes de usuario por dia y 300 por mes con contadores visibles en el portal
- los rechazos por fuera de alcance, diagnostico, TCA y patologia compleja son breves y consistentes

Estado actual de Fase 2, Fase 5:
- anadida la tabla `weekly_nutrition_plans` para guardar menus semanales en JSON estructurado
- el asistente ya puede guardar un menu semanal cuando el cliente lo pide explicitamente
- `/cliente/nutricion` ya muestra los menus semanales guardados
- `/cliente/ajustes` ya incluye acciones avanzadas con confirmacion para limpiar chat, memoria y planes guardados

Estado actual de agenda staff:
- `/agenda` es la pantalla operativa de sesiones de staff
- la agenda permite vistas de dia, semana y mes, filtrado por entrenador y seleccion por horas completas
- las citas se asocian a bonos sin consumir sesiones al crearlas; el consumo sigue siendo manual
- los bonos compartidos asocian automaticamente todos sus titulares a la cita
- cada perfil staff puede elegir un color pastel para diferenciar visualmente sus citas
- las citas canceladas se mantienen visibles en gris suave y aparecen al final del dia para no mezclarse con las activas

Estado actual de agenda cliente:
- `/cliente/agenda` ofrece vistas de semana y mes dentro del portal
- el cliente solo ve sus propias sesiones o sesiones compartidas sin revelar la identidad del otro titular
- el cliente puede cancelar una sesion programada solo si faltan mas de 24 horas para el inicio
- las sesiones canceladas siguen visibles en gris suave y ya no se pueden volver a cancelar

Estado actual de consumo automatico:
- existe la Function `auto_consume_calendar_sessions` para consumir bonos de sesiones ya finalizadas; se ejecuta cada hora y deja una hora de margen antes de consumir
- el job solo actua sobre sesiones `scheduled` o `completed`; ignora `cancelled` y `no_show`
- si encuentra un consumo manual compatible, lo vincula a la sesion para no duplicar el descuento
- existe la Function `run_daily_expiry_scan` para caducar bonos vencidos y emitir avisos D-7/D-0; debe ejecutarse a diario con el token de sistema
- los bonos en pausa no caducan mientras la pausa esta activa; la pausa extiende `expires_on` y el job solo caduca tras reanudar el bono

Nota de UX del asistente:
- las respuestas del chat nutricional ya renderizan markdown basico con estilos visibles, incluyendo negritas, listas y saltos de linea
- el asistente nutricional genera la respuesta completa, la persiste y despues la entrega por chunks para evitar historiales incompletos si el streaming se corta

Estado actual de Fase 2, Fase 6:
- la ficha staff del cliente ya muestra estado del portal, proveedor, `claimed_at`, `last_login_at` y permite desvincular la cuenta del portal como admin
- la edicion de cliente ya muestra si la ficha esta lista para portal, si el email esta duplicado o si falta email, y permite desactivar/reactivar un acceso ya reclamado
- ajustes de admin incluye activacion manual de portal cliente para crear o reparar accesos con contrasena directa sin depender del codigo de email
- se ha preparado una checklist de smoke test especifica de Fase 2 para validar separacion staff/cliente, nutricion y soporte operativo
- quedan documentados los pasos de despliegue en InsForge Deployments para migraciones SQL, Functions y build final

Estado actual de fuerza:
- anadidas las tablas `strength_metrics` y `client_max_weight_entries` para configurar metricas de fuerza por gimnasio y guardar maximos de peso por cliente
- la migracion `insforge/sql/040_client_max_weight_tracking.sql` siembra `Pecho`, `Espalda` y `Pierna` como metricas iniciales por gimnasio sin hardcodearlas en la logica de negocio
- las escrituras staff usan Functions protegidas: `upsert_strength_metric`, `record_client_max_weight_entries`, `update_client_max_weight_entry` y `delete_client_max_weight_entry`
- `/settings` incluye la seccion admin `Pesos maximos` para crear, editar, activar/desactivar y ordenar metricas
- la ficha staff del cliente incluye resumen, formulario de registro parcial, grafica e historial de `Pesos maximos`; las metricas inactivas no aparecen para nuevos registros, pero su historial sigue consultable
- el portal cliente muestra `Mis pesos maximos` en dashboard y la vista `/cliente/pesos-maximos` con resumen, grafica e historial de solo lectura
- los clientes del portal solo tienen lectura de sus propios maximos; no existe escritura desde `/cliente/*`

## Fase 1 multitenant por subdominio

Trainium resuelve el gimnasio activo desde el host. El gimnasio inicial es `eltemplo`, accesible en `eltemplo.trainium.es`; el dominio raiz `trainium.es` no resuelve gimnasio y no debe mostrar datos operativos. En local y preview se usa `TRAINIUM_DEFAULT_GYM_SLUG=eltemplo` como fallback explicito.

La migracion `insforge/sql/032_multitenant_subdomains.sql` crea `gyms`, inserta `eltemplo` de forma idempotente, anade `gym_id` obligatorio a todas las tablas tenantables, migra todos los datos existentes a `eltemplo.id`, reemplaza constraints globales por constraints por gimnasio y prepara facturas con contador independiente por `gym_id`.

Despues de aplicar la migracion no existe modo legacy: cualquier tabla tenantable debe tener `gym_id NOT NULL` y `COUNT(*) WHERE gym_id IS NULL = 0`. Las Functions reciben el contexto de gimnasio desde el subdominio y todas las rutas staff/portal consultan filtrando por `gym_id`.

Orden de rollout de Fase 2:

1. `client portal auth`
2. `client dashboard`
3. `client activity history`
4. `nutrition assistant`
5. `weekly nutrition plans`
6. `advanced client settings`

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- shadcn/ui-style components
- `@insforge/sdk`
- InsForge Auth, Database, Functions, Storage y Deployments

## Reglas actuales de bonos

- Tipos por sesiones flexibles entre `1` y `30`
- Tipo `mensual` con caducidad al final del mes natural contratado
- Compartidos de hasta `5` titulares
- Solo los bonos por sesiones descuentan consumos manuales
- Crear un bono registra tambien su venta con metodo de pago y precio pactado
- Al crear o renovar un bono por sesiones se puede adjuntar un patron semanal para agendar automaticamente sus citas
- La fecha contable de ventas y renovaciones de bonos sigue `contracted_on`, aunque el alta en el sistema se haga mas tarde

## Puesta en marcha local

1. Instala dependencias:

```bash
npm install
```

2. Crea `.env.local` a partir de `.env.example` y completa:

- `NEXT_PUBLIC_INSFORGE_URL`
- `NEXT_PUBLIC_INSFORGE_ANON_KEY`
- `NEXT_PUBLIC_APP_URL` como fallback/canonical URL; los redirects de auth intentan usar primero el host publico de la request actual
- `TRAINIUM_ROOT_DOMAIN=trainium.es`
- `TRAINIUM_DEFAULT_GYM_SLUG=eltemplo`
- `APP_TIMEZONE`
- `BUSINESS_NAME`

3. Arranca el entorno local:

```bash
npm run dev
```

4. Verificaciones previas a despliegue:

```bash
npm run lint
npm run typecheck
npm run build
```

`npm run build` fuerza Webpack porque Next.js 16 usa Turbopack por defecto y en este workspace falla al recolectar paginas App Router existentes.

## Activacion de staff

Los usuarios staff nuevos pueden necesitar verificar su email con un codigo de 6 digitos antes de entrar por primera vez. Si intentan acceder desde `/login` sin haber activado la cuenta, Trainium redirige el flujo al modo de activacion y les pide el codigo recibido por email para completar el acceso.

## Operativa admin en ajustes y catalogo

La pantalla `/settings` ya incluye dos operaciones protegidas para admins:

- alta y mantenimiento de usuarios staff (`trainer` y `admin`) mediante la Function `create_staff_user`
- reenvio del codigo de activacion para staff pendiente mediante la Function `resend_staff_activation`
- ejecucion manual de `run_daily_expiry_scan` como fallback si el Schedule falla o no esta disponible
- edicion del negocio y subida de imagen PNG cuadrada para generar automaticamente logos, favicon e iconos PWA por `gym_id`

La pantalla `/products` ya permite a admins:

- anadir stock
- reducir stock con motivo obligatorio
- borrar productos solo si no tienen historial en `sale_items`

La pantalla `/sales` muestra la anulacion de ventas como una tarjeta propia para admins, usando la Function protegida `void_sale`.

## Preview visual local

Para revisar cambios visuales sin InsForge ni login real, activa el modo preview solo en `.env.local`:

```bash
TRAINIUM_VISUAL_PREVIEW=1
```

Despues arranca la app y abre una de estas rutas iniciales:

```bash
npm run dev
```

- Staff: `http://localhost:3000/dashboard?preview=staff`
- Cliente: `http://localhost:3000/cliente/dashboard?preview=cliente`

El parametro inicial guarda una cookie local `trainium_visual_preview`, asi que puedes navegar internamente sin repetir la query. En produccion el modo preview se ignora aunque alguien conozca el parametro. Las acciones sensibles en preview no escriben en InsForge y devuelven respuestas simuladas para facilitar pruebas visuales.

## Tests Playwright

Los tests e2e usan el preview visual local para cubrir smoke de staff, smoke del portal cliente y regresiones responsive del menu inferior:

```bash
npm run test:e2e
```

Variantes utiles:

```bash
npm run test:e2e:headed
npm run test:e2e:ui
```

La configuracion levanta Next.js en `http://127.0.0.1:3005` con `TRAINIUM_VISUAL_PREVIEW=1`.

## PWA instalable

Trainium expone un manifest App Router en `/manifest.webmanifest`, registra un service worker en `/sw.js` y carga iconos por tenant desde `settings.brand_assets` cuando existen. Si un gimnasio aun no ha subido imagen, se usan los iconos por defecto de `public/icons`. La instalacion PWA y las notificaciones push web se mantienen separadas: el push solo se activa desde `/cliente/ajustes` tras accion explicita del cliente.

### Regenerar iconos PWA

Los iconos por defecto se generan desde `public/trainium-icon.png`:

```bash
npm run generate:pwa-icons
```

### Instalar en Android

1. Abrir la URL publica activa de la app en Chrome.
2. Iniciar sesion si corresponde.
3. Tocar el aviso `Instalar Trainium` si aparece, o abrir el menu de Chrome.
4. Elegir `Instalar app` o `Anadir a pantalla de inicio`.
5. Abrir Trainium desde el nuevo icono.

### Instalar en iPhone o iPad

1. Abrir Trainium en Safari.
2. Tocar Compartir.
3. Tocar `Anadir a pantalla de inicio`.
4. Confirmar el nombre `Trainium`.
5. Abrir Trainium desde el nuevo icono.

Limitacion conocida de iOS: los permisos de notificaciones push solo pueden solicitarse cuando la PWA ya esta instalada en la pantalla de inicio.

### Verificar el manifest

1. Abrir la app en Chrome.
2. Abrir DevTools.
3. Entrar en `Application`.
4. Revisar `Manifest` y comprobar `name`, `start_url`, `display`, `theme_color` e iconos.
5. Revisar `Service Workers` y confirmar que `/sw.js` esta registrado.

## Notificaciones push PWA

La Fase 2 de PWA usa Web Push estandar sobre InsForge Database, Auth, Functions y Schedules. No usa Firebase Cloud Messaging ni apps nativas. Las comunicaciones de negocio se centralizan en `send_client_communication`, que intenta email y push cuando el canal esta disponible. En esta fase existen estos eventos:

- `pass_expiry_d7`: aviso 7 dias antes de caducar un bono.
- `pass_expiry_d0`: aviso el dia de caducidad de un bono.
- `pass_assigned`: confirmacion de nuevo bono o renovacion.
- `calendar_session_24h`: recordatorio el mismo dia de una sesion agendada, pensado para ejecutarse de madrugada antes de las 7:00 en `Europe/Madrid`.
- `manual_note`: aviso manual o confirmacion operativa.

No hay notificaciones push de nutricion, stock, informes ni alertas genericas de staff.

### Variables VAPID

Anadir en `.env.local` y en las variables del deployment de InsForge:

- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT`

`NEXT_PUBLIC_VAPID_PUBLIC_KEY` y `VAPID_PUBLIC_KEY` deben tener el mismo valor publico. `VAPID_SUBJECT` puede ser `mailto:soporte@trainium.app` o el email de soporte del negocio.

### Generar claves VAPID

Opcion compatible con Deno/Web Crypto:

```bash
deno run https://raw.githubusercontent.com/negrel/webpush/master/cmd/generate-vapid-keys.ts
```

La Function de envio usa `jsr:@negrel/webpush`, una libreria Web Push basada en Web APIs compatible con runtimes Deno/Web Worker. Se evita `web-push` de Node porque depende de APIs Node que no son apropiadas para InsForge Functions.

### Esquema push

Aplicar la migracion:

```bash
npx @insforge/cli db import insforge/sql/018_pwa_push_notifications.sql
```

Tablas nuevas:

- `push_subscriptions`
- `push_preferences`

`notification_log` queda ampliada para canal `push`, los `event_type` soportados y `dedupe_key`.

Para homogeneizar email y push, aplicar tambien:

```bash
npx @insforge/cli db import insforge/sql/026_homogeneous_client_communications.sql
```

### Functions push

Publicar o actualizar:

- `save_push_subscription`
- `remove_push_subscription`
- `update_push_preferences`
- `send_client_communication`
- `send_push_notification`
- `send_push_to_client`
- `send_pass_expiry_d7_pushes`
- `send_calendar_session_24h_reminders`

`save_push_subscription`, `remove_push_subscription` y `update_push_preferences` resuelven la identidad del cliente desde InsForge Auth y `client_portal_accounts`; el navegador nunca envia un `client_id`.

### Schedules

Crear estos Schedules en InsForge:

- Diario, despues de medianoche en `Europe/Madrid`: `send_pass_expiry_d7_pushes`
- Diario, de madrugada y siempre antes de las 7:00 en `Europe/Madrid`: `send_calendar_session_24h_reminders`

Ejemplo de creacion usando la `API_KEY` reservada de InsForge como credencial estable para jobs programados:

```bash
npx @insforge/cli schedules create \
  --name "Push caducidad bonos D-7" \
  --cron "10 0 * * *" \
  --url "<INSFORGE_BASE_URL>/functions/send_pass_expiry_d7_pushes" \
  --method POST \
  --headers '{"Authorization":"Bearer ${{secrets.API_KEY}}","Content-Type":"application/json"}' \
  --body '{}'

npx @insforge/cli schedules create \
  --name "Recordatorio sesiones del dia" \
  --cron "0 * * * *" \
  --url "<INSFORGE_BASE_URL>/functions/send_calendar_session_24h_reminders" \
  --method POST \
  --headers '{"Authorization":"Bearer ${{secrets.API_KEY}}","Content-Type":"application/json"}' \
  --body '{}'
```

Los envios usan dedupe por evento, canal, cliente y entidad:

- `pass_expiry_d7:email:{client_id}:{pass_id}:{expires_on}`
- `pass_expiry_d7:push:{client_id}:{pass_id}:{expires_on}`
- `pass_assigned:{channel}:{client_id}:{pass_id}`
- `calendar_session_24h:{channel}:{client_id}:{calendar_session_id}`

### Probar en Chrome desktop

1. Servir la app en HTTPS o `localhost`.
2. Entrar como cliente en `/cliente/login`.
3. Abrir `/cliente/ajustes`.
4. Pulsar `Activar notificaciones`.
5. Confirmar el permiso del navegador.
6. Ver en DevTools, `Application > Service Workers`, que `/sw.js` esta activo.
7. Crear o renovar un bono desde staff y verificar el evento `pass_assigned`.

### Probar en Android

1. Instalar Trainium desde Chrome.
2. Abrir Trainium desde el icono instalado.
3. Entrar en `/cliente/ajustes`.
4. Activar notificaciones y confirmar permisos.
5. Crear una cita para el cliente y ejecutar `send_calendar_session_24h_reminders` antes de las 7:00 con una cita programada para ese mismo dia.

### Probar en iPhone/iPad

1. Abrir Trainium en Safari.
2. Instalar con Compartir > `Anadir a pantalla de inicio`.
3. Abrir Trainium desde el icono.
4. Iniciar sesion como cliente.
5. Ir a `/cliente/ajustes` y activar notificaciones.

Limitacion iOS: Safari solo permite pedir permiso push a PWAs instaladas en pantalla de inicio.

### Troubleshooting push

- Permiso denegado: cambiar permisos del sitio en el navegador y volver a activar.
- No hay service worker: revisar `/sw.js`, `Application > Service Workers` y que la app este en HTTPS o localhost.
- Suscripcion inactiva: volver a activar desde `/cliente/ajustes`.
- Endpoint caducado: los envios con respuesta `404` o `410` marcan la suscripcion como inactiva.
- Faltan claves VAPID: revisar `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` y `VAPID_SUBJECT` en InsForge.

## Estructura relevante

- `app/`: rutas App Router
- `components/`: componentes UI compartidos
- `features/`: componentes y helpers por modulo
- `lib/insforge/`: cliente, auth y utilidades InsForge
- `insforge/sql/`: esquema y migraciones
- `insforge/functions/`: funciones de negocio

## Backend InsForge

### Esquema y seeds

- Esquema base: `insforge/sql/001_schema.sql`
- Seed inicial: `insforge/sql/002_seed.sql`
- Migracion de bonos flexibles y hasta 5 titulares: `insforge/sql/010_passes_flexible_model.sql`

### Orden recomendado para aplicar en un proyecto ya existente

```bash
npx @insforge/cli db import insforge/sql/005_grant_invoice_sequence.sql
npx @insforge/cli db import insforge/sql/010_passes_flexible_model.sql
npx @insforge/cli db import insforge/sql/003_phase3_clients_passes.sql
npx @insforge/cli db import insforge/sql/009_delete_client.sql
npx @insforge/cli db import insforge/sql/017_agenda_multi_passes.sql
npx @insforge/cli db import insforge/sql/020_clients_last_name_optional.sql
npx @insforge/cli db import insforge/sql/023_delete_pass_cascade_cleanup.sql
npx @insforge/cli db import insforge/sql/022_grant_invoice_sequence_all_roles.sql
```

### Buckets de Storage

Crear un bucket llamado `tickets` en InsForge Storage para los PDFs de ventas.

Crear tambien un bucket publico llamado `gym-branding` para las imagenes por gimnasio. La Function `update_business_settings` guarda las variantes en rutas versionadas:

```text
gyms/{gym_id}/branding/{version}/{variant}.{ext}
```

Aplicar la migracion de columnas de branding antes de usar la subida desde Ajustes:

```bash
npx @insforge/cli db import insforge/sql/036_business_branding_assets.sql
```

### Planificador diario

- Estrategia preferida: InsForge Schedules ejecutando `run_daily_expiry_scan`
- Fallback: usar la accion protegida expuesta en Ajustes o invocar manualmente la funcion hasta que Schedules este disponible

### Email experimental

- Las comunicaciones de negocio usan `client.emails.send()` desde `send_client_communication` cuando el cliente tiene email.
- Si falta email, el intento queda en `notification_log` como `skipped`.
- Si InsForge Email devuelve error, el canal email queda como `failed` y el resto de canales continua.
- Los emails de Auth siguen gestionados por InsForge Auth y no pasan por este dispatcher.

## Despliegue

Desplegar solo despues de `lint`, `typecheck` y `build` correctos:

```bash
npm run deploy
```

Si InsForge Deployments no estuviera disponible en este workspace, mantener la app buildable y ejecutar el flujo equivalente del panel/CLI cuando quede habilitado.

### Preparacion especifica de Fase 2

Antes de publicar la Fase 2 en InsForge Deployments:

1. Importar las migraciones de portal y nutricion en orden:

```bash
npx @insforge/cli db import insforge/sql/013_phase2_client_portal_accounts.sql
npx @insforge/cli db import insforge/sql/014_phase2_nutrition_assistant.sql
npx @insforge/cli db import insforge/sql/015_phase2_nutrition_memory_and_quotas.sql
npx @insforge/cli db import insforge/sql/016_phase2_weekly_nutrition_plans.sql
npx @insforge/cli db import insforge/sql/018_pwa_push_notifications.sql
npx @insforge/cli db import insforge/sql/026_homogeneous_client_communications.sql
npx @insforge/cli db import insforge/sql/037_manual_client_portal_activation.sql
npx @insforge/cli db import insforge/sql/038_hourly_auto_consume_job_runs.sql
```

2. Publicar o actualizar las Functions de Fase 2:

- `claim_client_portal_account`
- `record_client_portal_login`
- `update_client_portal_profile`
- `ensure_client_nutrition_thread`
- `append_nutrition_message`
- `update_client_nutrition_memory`
- `refresh_client_nutrition_summary`
- `save_weekly_nutrition_plan`
- `reset_client_nutrition_chat`
- `reset_client_nutrition_memory`
- `delete_client_weekly_nutrition_plans`
- `set_client_portal_account_status`
- `unlink_client_portal_account`
- `manually_activate_client_portal_account`
- `save_push_subscription`
- `remove_push_subscription`
- `update_push_preferences`
- `send_client_communication`
- `send_push_notification`
- `send_push_to_client`
- `send_pass_expiry_d7_pushes`
- `send_calendar_session_24h_reminders`

3. Ejecutar validacion local final:

```bash
npm run lint
npm run typecheck
npm run build
```

4. Desplegar la app:

```bash
npm run deploy
```

5. Hacer smoke test inmediato sobre staff y portal usando la checklist de Fase 2.

Nota operativa:
- el despliegue debe ignorar `.next`, `node_modules`, logs y ficheros locales mediante `.vercelignore` para evitar subidas innecesarias y errores de upload en Vercel

### URL publicada

- URL publica actual: la definida en InsForge Custom Domains o, en su defecto, la URL nativa `*.insforge.site`
- Ultimo deployment validado antes de esta iteracion: `64910067-0f06-43cb-97c1-312a3787cb9d`

### Verificacion rapida en produccion

1. Abrir `/login` y comprobar que carga la pantalla de acceso.
2. Abrir `/dashboard` sin sesion y comprobar que redirige al login.
3. Iniciar sesion con un usuario de `profiles`.
4. Verificar dashboard.
5. Ejecutar los 3 flujos core:
   - crear cliente
   - renovar bono
   - crear venta de producto

### Rollback basico

1. Listar deployments:

```bash
npx @insforge/cli deployments list
```

2. Identificar el ultimo deployment sano anterior.

3. Si el problema es de variables, corregirlas y redeplegar:

```bash
npx @insforge/cli deployments env list
npx @insforge/cli deployments env set NEXT_PUBLIC_APP_URL https://eltemplo.trainium.es
npx @insforge/cli deployments env set TRAINIUM_ROOT_DOMAIN trainium.es
npx @insforge/cli deployments env set TRAINIUM_DEFAULT_GYM_SLUG eltemplo
npm run deploy
```

4. Si el problema es de codigo, volver al estado local sano anterior y lanzar un nuevo `npm run deploy`.

## Smoke checklist

1. Iniciar sesion como admin.
2. Crear cliente.
3. Editar cliente.
4. Crear pase.
5. Editar un pase existente.
6. Borrar un pase de prueba y comprobar que tambien limpia consumos, pausas y la venta asociada cuando no hay renovaciones ni agenda vinculada.
7. Crear o editar un tipo de bono con sesiones flexibles o mensual.
8. Borrar un tipo de bono limpio sin bonos asociados.
9. Consumir una sesion.
10. Pausar pase dentro de reglas.
11. Renovar pase y verificar notificacion interna.
12. Crear producto.
13. Anadir stock como admin.
14. Reducir stock como admin con motivo.
15. Borrar un producto limpio sin historial de ventas.
16. Crear venta y verificar decremento de stock.
17. Anular una venta como admin y verificar reposicion de stock si aplica.
18. Crear o actualizar un usuario staff desde Ajustes.
19. Reenviar el codigo de activacion de un staff pendiente desde Ajustes.
20. Crear gasto.
21. Crear sesion de agenda.
22. Verificar que un bono compartido asocia todos sus titulares a la cita.
23. Ejecutar `run_daily_expiry_scan` una vez y verificar idempotencia.
24. Generar ticket PDF.
25. Verificar que cargan los informes.

## Smoke checklist de Fase 2

1. Iniciar sesion como admin en `/login`.
2. Iniciar sesion como trainer y comprobar que no ve acciones admin-only de portal ni de stock.
3. Abrir un cliente con email unico y verificar en staff:
   - estado del portal
   - proveedor
   - fecha de claim
   - ultimo acceso
4. Como admin, desvincular una cuenta de portal desde la ficha del cliente y verificar que desaparece el estado reclamado.
5. Volver a reclamar el portal desde `/cliente/login` o `/cliente/registro` con el mismo email valido.
6. Verificar que un usuario del portal no obtiene acceso a `/dashboard` ni a rutas staff.
7. Verificar que un usuario staff sin `profiles` queda bloqueado aunque exista en Auth.
8. Comprobar en `/cliente/dashboard` que los bonos compartidos muestran `Otro titular` y nunca el nombre real del segundo titular.
9. Abrir `/cliente/agenda` y verificar que carga la vista mensual.
10. Abrir `/cliente/nutricion` y enviar mensajes hasta comprobar que:
   - el contador diario sube
   - el contador mensual sube
   - el hilo persiste al recargar
11. Intentar superar 20 mensajes diarios y verificar bloqueo.
12. Intentar una consulta fuera de nutricion y verificar rechazo corto.
13. Intentar una consulta de diagnostico medico, TCA y patologia compleja y verificar rechazo corto.
14. Pedir explicitamente un menu semanal y verificar que aparece en la lista de planes guardados.
15. En `/cliente/ajustes`, borrar chat, memoria y planes guardados, confirmando cada accion.
16. Verificar en `audit_logs` eventos de:
   - `portal_claim`
   - `portal_login`
   - `nutrition_memory_update`
   - `nutrition_chat_reset`
   - `nutrition_memory_reset`
   - `nutrition_plan_save`
   - `nutrition_plan_delete`
