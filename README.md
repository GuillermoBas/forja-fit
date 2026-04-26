# ForjaFit

Aplicacion pequena de gestion para un gimnasio de entrenamiento personal. Esta construida como una unica app Next.js con InsForge como backend para autenticacion, base de datos, funciones, almacenamiento y despliegue.

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
- `/cliente/agenda` muestra una vista mensual placeholder para futuras citas y recordatorios
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

Nota de UX del asistente:
- las respuestas del chat nutricional ya renderizan markdown basico con estilos visibles, incluyendo negritas, listas y saltos de linea

Estado actual de Fase 2, Fase 6:
- la ficha staff del cliente ya muestra estado del portal, proveedor, `claimed_at`, `last_login_at` y permite desvincular la cuenta del portal como admin
- la edicion de cliente ya muestra si la ficha esta lista para portal, si el email esta duplicado o si falta email, y permite desactivar/reactivar un acceso ya reclamado
- se ha preparado una checklist de smoke test especifica de Fase 2 para validar separacion staff/cliente, nutricion y soporte operativo
- quedan documentados los pasos de despliegue en InsForge Deployments para migraciones SQL, Functions y build final

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

## Puesta en marcha local

1. Instala dependencias:

```bash
npm install
```

2. Crea `.env.local` a partir de `.env.example` y completa:

- `NEXT_PUBLIC_INSFORGE_URL`
- `NEXT_PUBLIC_INSFORGE_ANON_KEY`
- `NEXT_PUBLIC_APP_URL`
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

## PWA instalable

ForjaFit expone un manifest App Router en `/manifest.webmanifest`, registra un service worker en `/sw.js` y usa los iconos generados en `public/icons`. La instalacion PWA y las notificaciones push web se mantienen separadas: el push solo se activa desde `/cliente/ajustes` tras accion explicita del cliente.

### Regenerar iconos PWA

Los iconos se generan desde `public/forjafit-logo.png` o, si no existe, desde `public/forjafit-icon.png`:

```bash
npm run generate:pwa-icons
```

### Instalar en Android

1. Abrir `https://4nc39nmu.insforge.site` en Chrome.
2. Iniciar sesion si corresponde.
3. Tocar el aviso `Instalar ForjaFit` si aparece, o abrir el menu de Chrome.
4. Elegir `Instalar app` o `Anadir a pantalla de inicio`.
5. Abrir ForjaFit desde el nuevo icono.

### Instalar en iPhone o iPad

1. Abrir ForjaFit en Safari.
2. Tocar Compartir.
3. Tocar `Anadir a pantalla de inicio`.
4. Confirmar el nombre `ForjaFit`.
5. Abrir ForjaFit desde el nuevo icono.

Limitacion conocida de iOS: los permisos de notificaciones push solo pueden solicitarse cuando la PWA ya esta instalada en la pantalla de inicio.

### Verificar el manifest

1. Abrir la app en Chrome.
2. Abrir DevTools.
3. Entrar en `Application`.
4. Revisar `Manifest` y comprobar `name`, `start_url`, `display`, `theme_color` e iconos.
5. Revisar `Service Workers` y confirmar que `/sw.js` esta registrado.

## Notificaciones push PWA

La Fase 2 de PWA usa Web Push estandar sobre InsForge Database, Auth, Functions y Schedules. No usa Firebase Cloud Messaging ni apps nativas. En esta fase solo existen estos eventos:

- `pass_expiry_d7`: aviso 7 dias antes de caducar un bono.
- `pass_assigned`: confirmacion de nuevo bono o renovacion.
- `calendar_session_24h`: recordatorio 24 horas antes de una sesion agendada.

No hay notificaciones push de nutricion, stock, informes ni alertas genericas de staff.

### Variables VAPID

Anadir en `.env.local` y en las variables del deployment de InsForge:

- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT`

`NEXT_PUBLIC_VAPID_PUBLIC_KEY` y `VAPID_PUBLIC_KEY` deben tener el mismo valor publico. `VAPID_SUBJECT` puede ser `mailto:soporte@forjafit.com` o el email de soporte del negocio.

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

`notification_log` queda ampliada para canal `push`, los tres `event_type` soportados y `dedupe_key`.

### Functions push

Publicar o actualizar:

- `save_push_subscription`
- `remove_push_subscription`
- `update_push_preferences`
- `send_push_notification`
- `send_push_to_client`
- `send_pass_expiry_d7_pushes`
- `send_calendar_session_24h_reminders`

`save_push_subscription`, `remove_push_subscription` y `update_push_preferences` resuelven la identidad del cliente desde InsForge Auth y `client_portal_accounts`; el navegador nunca envia un `client_id`.

### Schedules

Crear estos Schedules en InsForge:

- Diario, despues de medianoche en `Europe/Madrid`: `send_pass_expiry_d7_pushes`
- Cada hora: `send_calendar_session_24h_reminders`

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
  --name "Push recordatorio sesiones 24h" \
  --cron "0 * * * *" \
  --url "<INSFORGE_BASE_URL>/functions/send_calendar_session_24h_reminders" \
  --method POST \
  --headers '{"Authorization":"Bearer ${{secrets.API_KEY}}","Content-Type":"application/json"}' \
  --body '{}'
```

Los envios usan dedupe:

- `pass_expiry_d7:{pass_id}:{client_id}:{expires_on}`
- `pass_assigned:{pass_id}:{client_id}`
- `calendar_session_24h:{calendar_session_id}:{client_id}`

### Probar en Chrome desktop

1. Servir la app en HTTPS o `localhost`.
2. Entrar como cliente en `/cliente/login`.
3. Abrir `/cliente/ajustes`.
4. Pulsar `Activar notificaciones`.
5. Confirmar el permiso del navegador.
6. Ver en DevTools, `Application > Service Workers`, que `/sw.js` esta activo.
7. Crear o renovar un bono desde staff y verificar el evento `pass_assigned`.

### Probar en Android

1. Instalar ForjaFit desde Chrome.
2. Abrir ForjaFit desde el icono instalado.
3. Entrar en `/cliente/ajustes`.
4. Activar notificaciones y confirmar permisos.
5. Crear una cita para el cliente y ejecutar `send_calendar_session_24h_reminders` con una cita dentro de la ventana de 23-25 horas.

### Probar en iPhone/iPad

1. Abrir ForjaFit en Safari.
2. Instalar con Compartir > `Anadir a pantalla de inicio`.
3. Abrir ForjaFit desde el icono.
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

- Esquema base: [insforge/sql/001_schema.sql](/C:/Users/guill/OneDrive/CodeDev/ForjaFit/insforge/sql/001_schema.sql)
- Seed inicial: [insforge/sql/002_seed.sql](/C:/Users/guill/OneDrive/CodeDev/ForjaFit/insforge/sql/002_seed.sql)
- Migracion de bonos flexibles y hasta 5 titulares: [insforge/sql/010_passes_flexible_model.sql](/C:/Users/guill/OneDrive/CodeDev/ForjaFit/insforge/sql/010_passes_flexible_model.sql)

### Orden recomendado para aplicar en un proyecto ya existente

```bash
npx @insforge/cli db import insforge/sql/010_passes_flexible_model.sql
npx @insforge/cli db import insforge/sql/003_phase3_clients_passes.sql
npx @insforge/cli db import insforge/sql/009_delete_client.sql
npx @insforge/cli db import insforge/sql/017_agenda_multi_passes.sql
```

### Bucket de tickets

Crear un bucket llamado `tickets` en InsForge Storage para los PDFs de ventas.

### Planificador diario

- Estrategia preferida: InsForge Schedules ejecutando `run_daily_expiry_scan`
- Fallback: usar la accion protegida expuesta en Ajustes o invocar manualmente la funcion hasta que Schedules este disponible

### Email experimental

- Los recordatorios de caducidad usan `client.emails.send()` del SDK cuando el servicio este disponible.
- Si InsForge Email no esta habilitado o devuelve error, la app degrada a fallback no-op y registra el intento en `notification_log` con estado `skipped`.
- El job diario aplica throttling simple con un maximo de 10 envios por ejecucion para respetar limites horarios conservadores.

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
- `save_push_subscription`
- `remove_push_subscription`
- `update_push_preferences`
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

- URL actual de produccion: [https://4nc39nmu.insforge.site](https://4nc39nmu.insforge.site)
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
npx @insforge/cli deployments env set NEXT_PUBLIC_APP_URL https://4nc39nmu.insforge.site
npm run deploy
```

4. Si el problema es de codigo, volver al estado local sano anterior y lanzar un nuevo `npm run deploy`.

## Smoke checklist

1. Iniciar sesion como admin.
2. Crear cliente.
3. Editar cliente.
4. Crear pase.
5. Editar un pase existente.
6. Borrar un pase limpio y comprobar que un cliente sin relaciones ya se puede borrar.
7. Crear o editar un tipo de bono con sesiones flexibles o mensual.
8. Consumir una sesion.
9. Pausar pase dentro de reglas.
10. Renovar pase y verificar notificacion interna.
11. Crear producto.
12. Anadir stock como admin.
13. Crear venta y verificar decremento de stock.
14. Crear gasto.
15. Crear sesion de agenda.
16. Verificar que un bono compartido asocia todos sus titulares a la cita.
17. Ejecutar `run_daily_expiry_scan` una vez y verificar idempotencia.
18. Generar ticket PDF.
19. Verificar que cargan los informes.

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
