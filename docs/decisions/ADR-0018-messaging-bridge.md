# ADR-0018 — Puente de mensajería: `MessagingModule` + tools `list_chats`/`read_messages`/`send_message`

**Fecha:** 2026-08-19
**Estado:** Aceptado — verificado contra datos reales de producción (solo lectura) + arranque real del `AppModule` completo.

## Contexto

Desde ADR-0016, las tools de mensajería (`read_message`, `send_message`)
quedaron explícitamente fuera del Tool Registry porque el dominio de
mensajería vivía únicamente en `proyecto-mensajeria/`, hablando directo con
Supabase desde el front-end — sin ninguna capa de aplicación NestJS que el
asistente pudiera invocar sin romper la regla "la IA nunca toca Postgres/
Redis directo".

El fundador preguntó explícitamente por esta pieza ("cuando yo le diga
léeme el mensaje de Jheison, escríbele esto...") y luego pidió cerrarla,
aclarando que es trabajo de backend independiente de la integración
Realtime/STT (que sí depende de que provisione Gemini).

## Decisión

Se construyó `backend/src/modules/messaging/` (`MessagingService`) como
envoltorio real sobre las MISMAS tablas que ya usa `proyecto-mensajeria`
(`chats`, `chat_participants`, `messages`, `contacts`, `profiles` — mismas
columnas, ver `proyecto-mensajeria/src/lib/actions/chats.ts` y
`contacts.ts`). No se creó esquema nuevo ni se duplicó ninguna tabla.

Usa `SUPABASE_ADMIN_CLIENT` (bypassa RLS a propósito, mismo patrón que el
resto del backend) — por lo que **cada método reimplementa a mano la misma
autorización que la RLS real ya exige** en `proyecto-mensajeria`
(`messages_insert_participant`, `messages_select_participant`, etc.):
`assertParticipant(userId, chatId)` se llama antes de leer o escribir, y
`sender_id` siempre se fija al `userId` autenticado del JWT — nunca a un
valor que venga del argumento de una tool.

Tres tools nuevas en el Tool Registry (`backend/src/modules/assistant/tools/`):

- `list_chats` — lista los chats 1 a 1 reales del usuario.
- `read_messages` — lee los últimos mensajes de texto de un chat,
  identificado por nombre de contacto (resuelto vía la tabla `contacts` del
  propio usuario) o por `chatId` directo.
- `send_message` — envía un mensaje de texto real. `requiresConfirmation =
  true` a propósito, mismo criterio que `activate_emergency_corridor`:
  mandar un mensaje a otra persona es una acción irreversible y visible
  para un tercero (coincide además con la regla general del entorno:
  "enviar cualquier mensaje en nombre del usuario" requiere permiso
  explícito). La primera llamada sin `confirmed: true` no ejecuta ningún
  efecto real.

**Alcance a propósito, hoy: SOLO chats 1 a 1 y mensajes de tipo texto.**
Según el comentario de origen en `chats.ts` (mensajería real del
2026-08-18), reacciones, notas de voz, fotos/documentos, ubicación y grupos
siguen siendo simulación local en el frontend — no existen todavía como
datos reales en Supabase. Por eso el asistente tampoco puede leer/mandar
una nota de voz de verdad hoy: no hay dato real que mover, fingirlo habría
violado la regla "no simulación". Esto es independiente de Gemini/Realtime
— es un gap del propio modelo de datos de mensajería, documentado aparte en
`MISSING_CAPABILITIES.md`.

## Verificación (real, sin mocks)

- `typecheck`/`lint`/`build`: limpios.
- **Arranque real del `AppModule` completo** (`@nestjs/testing`, devDependency
  temporal, removida al terminar): confirma que `MessagingModule` importado
  dentro de `AssistantModule` no introduce ciclos, y que las 9 tools totales
  (las 6 previas + las 3 nuevas) quedan registradas, incluyendo que
  `send_message` exige confirmación. Nota técnica: correr este smoke test
  con `bunx tsx` produjo un falso positivo (los 9 parámetros del
  constructor llegaban `undefined` por un problema de metadata de
  decoradores de `tsx`, no del código); con `bun run` directo — que sí
  respeta `emitDecoratorMetadata`/`reflect-metadata`, mismo runtime que usa
  el resto del backend — el arranque fue limpio.
- **Lógica de lectura verificada contra datos reales de producción**, solo
  lectura, vía Supabase MCP (sin pasar por el backend, para no requerir la
  service role key en este entorno): se confirmó que la consulta que hace
  `resolveChatByContactName` resuelve correctamente un contacto real (el
  propio caso "léeme el mensaje de Jheison") a su chat real, que
  `getRecentTextMessages` encuentra los 41 mensajes reales del chat — todos
  de tipo texto, ninguno borrado — y que la verificación de autorización
  (`assertParticipant`) deniega correctamente a un `userId` que no
  pertenece al chat.
- **Deliberadamente NO se probó el camino de escritura (`sendTextMessage`)
  contra el chat real de producción** — hacerlo habría insertado un mensaje
  visible para un tercero real (el otro participante del chat) sin su
  consentimiento, algo que este entorno no hace por regla de seguridad ni
  aunque el fundador lo pida para una prueba. Queda como paso manual: una
  vez el backend esté corriendo, el propio fundador puede probar
  `send_message` con su sesión real contra su propio contacto real — es su
  decisión, no algo que este backend deba disparar solo.

## Referencias

- `docs/decisions/ADR-0016-assistant-tool-registry.md`
- `backend/src/modules/messaging/`, `backend/src/modules/assistant/tools/{list-chats,read-messages,send-message}.tool.ts`
- `proyecto-mensajeria/src/lib/actions/chats.ts`, `contacts.ts`
