# ADR-0033 — Web Push real (primer slice)

**Fecha:** 2026-08-27
**Estado:** Aceptado — verificado contra infraestructura real (RLS real vía
simulación transaccional, 5/5 casos; librería `web-push` real contra un
servidor HTTPS local real, 3/3 casos; conversión de llave VAPID probada
contra una llave real generada por la misma librería). `typecheck`/`lint`/
`build` limpios en backend y en `proyecto-mensajeria`.

## Contexto

Gap documentado desde ADR-0015 y ADR-0030: los avisos de recordatorios
(geofence y hora fija) solo llegaban si la persona tenía la app abierta con
un socket conectado al namespace `/location` — sin app abierta, el aviso se
perdía en silencio (quedaba visible al volver a abrir la app, pero nadie se
enteraba en el momento). El roadmap agrupaba "notificaciones push
(FCM/APNs)" como pendiente de la fase de mensajería (fila 5 del cronograma).

Auditoría antes de construir (regla del proyecto): `proyecto-mensajeria` es
hoy una app 100% web (Vite + TanStack Start, sin Capacitor ni empaquetado
nativo — confirmado revisando `package.json`, no hay ninguna dependencia ni
configuración de Capacitor). Esto cambia el alcance real: FCM/APNs
*nativos* (SDK de Android/iOS dentro de una app instalada) no aplican
todavía, porque no hay una app instalada. Lo que sí aplica hoy es **Web
Push** — el estándar del navegador (`Notification`/`PushManager`/Service
Worker), que Chrome/Firefox/Edge enrutan a través de sus propios servicios
(FCM en modo web para Chrome, autopush de Mozilla para Firefox) sin
necesitar una app nativa ni Capacitor.

## Decisión

`web-push` (paquete npm oficial, implementa el protocolo VAPID de la RFC de
Web Push) como adapter en el backend, siguiendo la misma regla de
"proveedores detrás de adapters" que ya aplica a Google Maps/OpenAI/Redis.

**Nueva tabla real** `push_subscriptions` (Supabase, migración aplicada:
`add_push_subscriptions`) — una fila por navegador/dispositivo suscrito
(`user_id`, `endpoint`, `p256dh`, `auth`), RLS dueño-únicamente (select/
insert/update/delete solo si `auth.uid() = user_id`); el backend la lee vía
la service role (bypassa RLS a propósito, mismo patrón que el resto del
proyecto).

**`WebPushService`** (`backend/src/modules/push-notifications/`):
`sendToUser(userId, category, payload)` — antes de mandar nada, revisa
`profiles.notification_settings` (columna jsonb que ya existía en el
esquema real desde antes, sin usar todavía del lado del front — ver más
abajo) para respetar la preferencia real de la persona; si la persona
apagó ese tipo de aviso, no manda nada. Si una suscripción responde 404/410
(el navegador ya no la reconoce — desinstaló, borró datos, etc.), se borra
sola de la tabla para no reintentar contra un endpoint muerto para
siempre. Sin `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT`
configuradas, queda en no-op con un warning al arrancar — mismo criterio ya
usado para `GOOGLE_MAPS_API_KEY` cuando el fundador todavía no la había
provisionado.

**Primer (y único, por ahora) consumidor real:** `NoteReminderProcessor`
(ADR-0030) — al disparar un recordatorio de nota con hora fija, ahora manda
tanto el evento de socket de siempre (`LocationBroadcastService.notify`)
como un Web Push real (`category: "noteReminders"`). Ambos caminos son
independientes: si no hay socket conectado pero sí hay una suscripción de
push activa, el aviso igual llega.

**Frontend** (`proyecto-mensajeria`): `public/sw.js` (service worker plano,
sin caché/offline — solo maneja `push`/`notificationclick`; si ya hay una
pestaña de la app enfocada, no duplica con un aviso del sistema operativo
encima de lo que Realtime ya está mostrando en vivo). `src/lib/actions/push.ts`
(`subscribeToPush`/`unsubscribeFromPush`/`getPushSupportStatus`) pide
permiso real al navegador, registra el service worker, suscribe con
`PushManager`, guarda la suscripción real en `push_subscriptions`. Entrada
de UI: Ajustes → Notificaciones (`NotificationsScreen.tsx`), ya existía como
subpantalla con interruptores por categoría — se le agregó arriba un
interruptor maestro real "Notificaciones del navegador" que refleja el
estado real de `Notification.permission`, sin nada simulado.

**De paso, se hizo real la persistencia de `profiles.notification_settings`**
(columna jsonb que ya existía en el esquema, con default
`{calls,messages,voiceNotes,noteReminders}`, pero el front nunca la leía ni
la escribía — los interruptores de "Avisos" en Ajustes solo vivían en
memoria de la sesión y se "olvidaban" al recargar, mismo síntoma que tenía
nombre/"acerca de" antes de ADR-0028). Se hizo porque `WebPushService`
necesita leer esa preferencia de verdad para respetarla — no tenía sentido
construir el lado de lectura sin el de escritura.

## Fuera de alcance de este slice

- **Push para mensajes de chat nuevos.** `proyecto-mensajeria` habla
  directo con Supabase (ADR-0018) — un mensaje nuevo nunca pasa por este
  backend, así que `WebPushService` no tiene dónde engancharse hoy. Para
  cubrir esto haría falta un trigger de Postgres + Supabase Edge Function
  (o un webhook hacia este backend), decisión de arquitectura aparte que no
  se tomó unilateralmente aquí — no hay evidencia todavía de que sea
  prioritario sobre el resto del roadmap.
- **Alertas del Emergency Corridor** (`AlertPolicyService`, Fase 3) — usa el
  mismo `LocationBroadcastService.notify()` que los recordatorios, así que
  técnicamente es fácil de conectar, pero es una decisión de producto
  aparte (¿debe poder silenciarse una alerta `CRITICAL` de un carro cruzado
  con una ambulancia? probablemente no) que no se tomó aquí sin pedirla.
- **Recordatorios por geofence** (`kind: "location"`) — su disparo vive en
  el ack del mismo socket que reporta la ubicación (`GeofenceTriggerService`),
  no en un evento server-initiated como `NoteReminderProcessor`; conectar
  Web Push ahí es un cambio de forma distinto, no el mismo diff.
- FCM/APNs nativos — se revisarán junto con el empaquetado Android/Capacitor
  (todavía sin empezar), no antes.
- Íconos/badges/acciones personalizadas en la notificación del sistema
  operativo — no pedido.

## Verificación real

- **RLS de `push_subscriptions`** — simulación transaccional real (mismo
  técnica que ADR-0018/0025/0028/0029/0031) contra la base real: 5/5 casos
  — el dueño inserta y ve su propia fila; un extraño no puede verla, no
  puede insertar una fila a nombre de otro usuario, y un intento de borrado
  de un extraño afecta 0 filas y la fila sigue existiendo para el dueño
  después del intento. `get_advisors` (security) revisado — sin hallazgos
  nuevos relacionados con esta tabla.
- **Librería `web-push` real** — contra un servidor HTTPS local real
  (certificado autofirmado, no un mock de la librería): 3/3 casos — un 201
  real no lanza excepción, un 410 real y un 404 real sí lanzan con el
  `statusCode` esperado (la señal que usa `WebPushService` para podar
  suscripciones vencidas), usando una llave VAPID desechable generada solo
  para esta prueba (nunca la del proyecto real).
- **Conversión de llave VAPID (front)** — `urlBase64ToUint8Array` probada
  contra una llave pública VAPID real (generada por la misma librería
  `web-push`, no inventada): produce 65 bytes empezando en `0x04`, el
  formato real de un punto EC P-256 sin comprimir.
- `bun run typecheck`/`lint`/`build` — limpios en `backend/` (mismo warning
  ya aceptado de `no-explicit-any` en `user-aware-throttler.guard.ts`, sin
  relación con este cambio). En `proyecto-mensajeria`: 0 errores tras
  `eslint --fix` (solo formato), typecheck limpio, `vite build` real
  incluyendo la generación del `.output` para el preset `cloudflare-module`
  — se confirmó que `public/sw.js` queda copiado tal cual a
  `.output/public/sw.js`.
- Pendiente, honesto: no se probó una suscripción real desde un navegador
  real ni una entrega real contra el servicio de push real de Chrome/
  Firefox (FCM web/autopush de Mozilla) — este entorno no tiene un
  navegador con perfil de usuario real para eso, y las llaves VAPID reales
  del proyecto las debe generar el fundador (`bunx web-push
  generate-vapid-keys`), nunca deben pasar por este chat. Queda para
  prueba manual: activar notificaciones desde Ajustes en un navegador real,
  programar una nota con hora fija a 1 minuto, cerrar la pestaña, y
  confirmar que llega el aviso del sistema operativo.
