# ADR-0031 — Fotos y documentos reales en la mensajería

**Fecha:** 2026-08-27
**Estado:** Aceptado — cero migraciones nuevas (REUSE total, mismo patrón
que ADR-0024/0025/0029). Verificado con simulación transaccional de RLS
real contra el chat/participantes reales (4/4 casos) y `typecheck`/`lint`/
`build` limpios (build de producción completo). Un bug real de ruta de
Storage se encontró y corrigió ANTES de tocar el código de producción — ver
"Verificación real".

## Contexto

Siguiente pendiente de la lista fácil→difícil tras ADR-0030 (BullMQ). El
menú de adjuntar de `MessageComposer.tsx` (cámara/galería/documento) era
100% decorativo: `onSendAttachment("image", "foto-camara.jpg")` mandaba un
nombre de archivo inventado, sin abrir ningún selector de archivo real ni
subir nada a Storage.

Auditoría del esquema vivo (antes de escribir código, mismo protocolo de
siempre) encontró que ya existía todo lo necesario, sin conectar:

- `messages.type` (`message_kind`) ya incluye `"image"` y `"document"`
  (además de `"voice"`, ya usado desde ADR-0024).
- `messages.media_url`/`media_file_name`/`media_file_size_bytes` — las
  mismas columnas genéricas que ya usa la nota de voz.
- Un bucket privado `chat-media` (`storage.buckets`) con sus tres políticas
  RLS ya aplicadas (`chat_media_participant_insert`,
  `chat_media_participant_select`, `chat_media_owner_delete`) — nunca
  usado por ningún flujo del frontend hasta ahora.
- `mapMessageRow` (`chats.ts`) ya arma `attachment.{url,fileName,
  fileSizeBytes}` genéricamente para cualquier `type` distinto de
  `"text"`/`"system"` — no necesitó ningún cambio.

## Decisión

**REUSE total — cero migraciones.** Se construyó:

1. `uploadChatMedia(chatId, file)` (nuevo, `chats.ts`) — sube el archivo
   real al bucket `chat-media`, devuelve la ruta guardada (bucket privado,
   sin URL pública).
2. `insertAttachmentMessage(...)` (nuevo) — inserta el mensaje real
   (`type: "image"|"document"`, `media_url`/`media_file_name`/
   `media_file_size_bytes`), mismo patrón que `insertVoiceMessage`.
3. `resolveChatMediaUrl(sourceUrl, bucket?)` (nuevo, factorizado para
   reusarse entre foto/documento — antes esta lógica solo existía inline en
   `VoiceNotePlayer.tsx` para voz) — pasa directo si ya es `blob:`/`http`
   (burbuja optimista), o firma la ruta real bajo demanda si no.
4. `sendAttachmentMessage` (existente, antes 100% simulado con `url: "#"`)
   ahora recibe un `localUrl` real (`URL.createObjectURL(file)`) para la
   burbuja optimista — mismo patrón que `sendVoiceNote`.
5. `useChats.ts`: `reconcileSentAttachment` (nuevo, mismo patrón de
   `reconcileSentVoiceNote` — sube, inserta, reconcilia o marca `failed` si
   algo falla) y `sendAttachment` reescrito para recibir un `File` real en
   vez de un nombre de archivo inventado.
6. `MessageComposer.tsx`: tres `<input type="file">` reales, ocultos,
   activados por los botones de Cámara (`capture="environment"`), Galería y
   Documento — reemplazan las tres llamadas hardcodeadas.
7. `MessageBubble.tsx`: `ChatImage` (nuevo) renderiza la foto real (URL
   firmada resuelta al montar, con estado de carga/error) en vez de un
   ícono de placeholder fijo; `DocumentAttachment` (nuevo) hace clic para
   resolver la URL firmada y abrir/descargar el documento en una pestaña
   nueva — antes solo mostraba nombre/tamaño sin poder abrirse.

## Verificación real

- **Bug real encontrado ANTES de escribir el código de producción:**
  `chat-media` tiene una convención de carpeta distinta a `voice-notes`.
  `voice-notes` usa `chat/{chatId}/...` (dos niveles, la policy
  `voice_notes_insert` compara `[1] = 'chat'` y castea `[2]` a uuid); pero
  `chat_media_participant_insert` castea directo `(storage.foldername
  (name))[1]` a uuid — es decir, `chat-media` espera `{chatId}/...`, SIN el
  prefijo `chat/`. Se descubrió leyendo `pg_policies` antes de escribir
  `uploadChatMedia`, y se confirmó con una simulación real: con el prefijo
  `chat/` (calcado del patrón de voz), Postgres lanza
  `22P02: invalid input syntax for type uuid: "chat"` al intentar castear
  el string literal `"chat"`. Se implementó `uploadChatMedia` con la ruta
  correcta desde el inicio, evitando un bug que solo se habría descubierto
  en producción al primer intento real de subida.
- Simulación transaccional de RLS (revertida, `rollback`, 0 filas
  afectadas) contra el chat real y sus dos participantes reales
  (`8c896bbd-...`, cuentas A/B ya usadas en ADR-0029): con la ruta
  corregida (`{chatId}/archivo.ext`), `is_chat_participant` vía
  `storage.foldername` da `true` para A y para B, y `false` para un
  `auth.uid()` que no es participante del chat — 4/4 casos (2 positivos +
  1 negativo, verificados con y sin el bug de ruta para confirmar que
  efectivamente lo distingue).
- `bun run typecheck` / `lint` / `build` (build de producción completo) —
  limpios.
- Pendiente, honesto: no se probó una subida real vía HTTP contra el
  Storage API (requeriría un JWT real de usuario, que este entorno no
  puede generar sin credenciales que nunca debe recibir) — la verificación
  de arriba prueba la política de RLS real a nivel de Postgres, no el
  round-trip HTTP completo. Selección real de cámara/galería en un
  navegador real también queda pendiente de prueba manual del fundador
  (sandbox sin cámara/galería, mismo límite que ADR-0024/0028).

## Fuera de alcance de este slice

- Miniaturas/compresión de imágenes antes de subir (se sube el archivo
  original tal cual lo entrega el selector).
- Límite de tamaño de archivo validado en el cliente — sin evidencia de
  necesidad todavía; el límite real (si aplica) lo impone el proyecto de
  Supabase, no el frontend.
- Adjuntar foto/documento a una nota de voz o combinarlo con texto en el
  mismo mensaje (WhatsApp permite "foto con pie de texto"; aquí cada envío
  es un mensaje separado, igual que antes).
- Refactor de `VoiceNotePlayer.tsx` para reusar `resolveChatMediaUrl` —
  quedó su propia copia inline de la misma lógica para no tocar código ya
  funcionando sin necesidad real.
