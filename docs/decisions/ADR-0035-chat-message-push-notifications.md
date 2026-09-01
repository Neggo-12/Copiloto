# ADR-0035 — Push real para mensajes de chat nuevos

**Fecha:** 2026-09-01
**Estado:** Aceptado — migración aplicada y Edge Function desplegada en el
proyecto real (`Copiloto`, `wrkuusacwkdazfwynhkz`), con permiso explícito
del fundador. Verificado real, sin mocks: `INSERT` real de un mensaje de
prueba en `messages` (borrado enseguida) → `net._http_response` real
confirma que el trigger llamó a la Edge Function y esta respondió
`200 "ok (vapid not configured)"` — cadena completa Postgres → pg_net →
Edge Function → validación del secreto → relectura del mensaje real,
confirmada de punta a punta. Pendiente solo lo que no se puede hacer desde
aquí: las llaves VAPID como secrets de la función (ver "Pendiente").

## Contexto

ADR-0033 (Web Push, primer slice) dejó esto explícitamente fuera de
alcance: `proyecto-mensajeria` inserta mensajes DIRECTO en Supabase
(ADR-0018, "todo es un solo producto" pero el chat en sí nunca pasó por el
backend NestJS) — un mensaje nuevo nunca pasa por `WebPushService`, así que
no había dónde engancharse. La nota de ADR-0033 ya apuntaba la solución:
"haría falta un trigger de Postgres + Supabase Edge Function (o un webhook
hacia este backend)".

Auditoría antes de construir (regla del proyecto): se revisó si el backend
NestJS tiene una URL pública a la que Postgres le pudiera pegar un webhook
directo (lo que hubiera permitido reusar `WebPushService` sin duplicar
nada). No la tiene — corre local en la máquina del fundador
(`localhost:3001`, confirmado en `env.validation.ts`/`app.module.ts`, sin
ninguna variable de despliegue). Verificado también contra el proyecto real
de Supabase (`list_tables`/`list_edge_functions`/`list_migrations` vía MCP):
`push_subscriptions` y `messages` existen tal como los documenta ADR-0033/
ADR-0018, sin Edge Functions desplegadas todavía, sin trigger previo sobre
`messages`, `pg_net` disponible pero no habilitado.

## Decisión

Trigger de Postgres (`public.notify_new_message`, `AFTER INSERT ON
messages`) que llama a una Edge Function nueva (`notify-new-message`, Deno,
en la infraestructura de Supabase) usando `pg_net` — no un backend
propio, no una cola nueva, es la misma primitiva (`pg_net.http_post`) que
usa el feature nativo "Database Webhooks" del Dashboard de Supabase.
Deliberadamente asíncrono: si la Edge Function está caída o lenta, el
`INSERT` real del mensaje no se entera ni se demora.

**Por qué una Edge Function y no reusar `WebPushService` tal cual:**
`WebPushService` vive en el backend NestJS, que hoy no tiene URL pública —
Postgres (en la nube de Supabase) no puede llamarlo. La Edge Function SÍ
corre en la infraestructura de Supabase, con URL pública real. Esto
significa duplicar una porción real de lógica (envío con `web-push`, respeto
de `notification_settings`, poda de suscripciones vencidas 404/410) — no es
gratis, pero es la única opción que funciona hoy sin antes tomar una
decisión de infraestructura aparte (desplegar el backend en algún lado
público, no pedida ni evaluada aquí). Si el backend se despliega en el
futuro, esta Edge Function se puede reemplazar por un webhook directo a
`WebPushService.sendToUser()`, sin tocar el trigger.

**Seguridad, dos capas** (regla del proyecto: nunca confiar en datos sin
verificar, nunca exponer secretos):

1. El trigger manda SOLO `message_id` en el body — nunca el
   contenido/remitente/chat. La Edge Function los vuelve a leer ahí mismo,
   directo de la base real con su cliente de service role. Mismo criterio
   que `MessagingService.assertParticipant` en el backend: un
   `message_id` que no exista o esté borrado simplemente no genera aviso,
   nunca se confía en el payload para decidir a quién avisar ni qué
   mostrar.
2. Un secreto compartido (`x-webhook-secret`) generado por la base de datos
   MISMA (`gen_random_uuid()` concatenado dos veces, dentro de la
   migración) — nadie, ni Claude ni el fundador, lo escribe ni lo ve en
   texto plano en ningún chat/`.env`/comando. Vive encriptado en Supabase
   Vault; la Edge Function lo lee por RPC
   (`public.get_edge_webhook_secret()`, `security definer`, permiso
   revocado a `anon`/`authenticated`, otorgado solo a `service_role`) y lo
   compara contra el header entrante.

**Alcance real de a quién se le avisa**: todos los participantes del chat
menos el remitente, EXCEPTO quien tenga ese chat silenciado
(`chat_participants.is_muted`/`muted_until`, columnas ya reales del
esquema — no se pedía nada nuevo) o haya apagado `notification_settings.
messages` en Ajustes (ADR-0033). Cubre los 5 tipos reales de mensaje que
ya existen en producción (`text`, `voice` — ADR-0024, `image`/`document` —
ADR-0031, `location` — ADR-0025), con una vista previa corta por tipo
("🎤 Nota de voz", "📷 Foto", etc., nunca el archivo/contenido completo).
Excluye mensajes `type: "system"` y filas con `deleted_at`.

**Frontend**: sin cambios — `public/sw.js`/`push.ts` (ADR-0033) ya son
genéricos, no específicos de recordatorios; la categoría `"messages"` ya
existía como llave real de `notification_settings` y como interruptor en
`NotificationsScreen.tsx`, solo nunca había recibido un push real antes de
este ADR.

## Fuera de alcance / limitación honesta

- El clic en la notificación abre la app en `/` (raíz), no el chat
  específico — `proyecto-mensajeria` es hoy una SPA de una sola ruta real
  (confirmado revisando `router.tsx`/`routes/`, sin rutas por chat), no hay
  URL a la que enlazar un chat puntual sin antes agregar rutas reales. Mismo
  límite honesto que ya tenía el push de recordatorios (`url: "/notas"`,
  que tampoco es una ruta real hoy).
- Mensajes de grupo: título = nombre del grupo, cuerpo = "remitente:
  vista previa" — construido pero sin grupo real todavía en la base
  (`chats` con `rows: 0` al momento de escribir esto) para probarlo de
  punta a punta.
- No se generaron llaves VAPID nuevas — reusa las mismas de ADR-0033 (si ya
  las generó el fundador para el backend), solo hace falta configurarlas
  TAMBIÉN como secrets de esta Edge Function (ver "Pendiente").

## Pendiente, honesto

Con permiso explícito del fundador en el chat, se aplicó
`supabase/migrations/20260901000000_push_new_message_webhook.sql` y se
desplegó `supabase/functions/notify-new-message/` (`verify_jwt: false` a
propósito — el trigger de Postgres no manda un JWT de usuario, la función
implementa su propia autenticación con el secreto de Vault) contra el
proyecto real. Verificado con un `INSERT` real (ver "Estado" arriba).

Solo falta lo que no se puede hacer desde este chat (nunca debe pasar por
aquí un secreto real):

1. El fundador debe configurar `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/
   `VAPID_SUBJECT` como **secrets de la Edge Function** (Supabase CLI:
   `supabase secrets set --project-ref wrkuusacwkdazfwynhkz VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=...`,
   o desde el Dashboard → Edge Functions → Secrets) — mismas llaves que ya
   usa (o generará) `backend/.env` para ADR-0033. Hasta que estén, la
   función responde `200 "ok (vapid not configured)"` sin mandar nada, tal
   como confirmó la prueba real de hoy.
2. Prueba real pendiente con navegador de verdad (no se puede simular desde
   aquí): dos cuentas reales, notificaciones del navegador activadas en la
   que recibe, la pestaña de esa cuenta cerrada/sin foco, mandar un mensaje
   desde la otra cuenta y confirmar que llega el aviso del sistema
   operativo.

## Referencias

- `docs/decisions/ADR-0033-web-push-notifications.md` ("Fuera de alcance"
  — el gap que este ADR cierra)
- `docs/decisions/ADR-0018-messaging-bridge.md` (por qué los mensajes
  nunca pasan por el backend NestJS)
- `supabase/migrations/20260901000000_push_new_message_webhook.sql`
- `supabase/functions/notify-new-message/index.ts`
- `backend/src/modules/push-notifications/web-push.service.ts` (lógica
  hermana en el backend, no reusada directamente por la razón explicada
  arriba)
