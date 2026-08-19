# ADR-0024 — Notas de voz reales en mensajería

**Fecha:** 2026-08-19
**Estado:** Aceptado — verificado con `typecheck`/`lint`/`build` limpios en
frontend. Sin migraciones nuevas (REUSE puro del esquema/Storage existentes).

## Contexto

Pedido explícito del fundador (junto con ubicación y cifrado, ver
`MISSING_CAPABILITIES.md`): "notas de voz reales para la mensajería
avanzada". Auditoría (Discover) encontró que `VoiceRecorder.tsx` y
`VoiceNotePlayer.tsx` eran **100% decorativos**: no pedían permiso de
micrófono, no grababan audio real (`Math.random()` simulaba la onda), y el
reproductor no reproducía nada — solo animaba una barra de progreso falsa.
Esto no fue señalado por el fundador; se descubrió leyendo el código antes de
afirmar nada sobre "notas de voz funcionando", siguiendo la regla del
proyecto de no simulación.

Hallazgo importante de REUSE: el esquema original (ADR-0001) ya anticipaba
esto por completo — `messages.type` ya incluye `"voice"`, con columnas
`media_url`, `media_duration_seconds`, `waveform` (jsonb); el bucket privado
`voice-notes` ya existe con políticas RLS aplicadas
(`bucket_id = 'voice-notes' AND (storage.foldername(name))[1] = 'chat' AND
is_chat_participant((storage.foldername(name))[2]::uuid)`). **No se necesitó
ninguna migración nueva** — solo reemplazar el código de aplicación
decorativo por uno real que use lo que ya existía.

## Decisión

**REUSE, no REPLACE.** Se construyó:

1. `useVoiceRecorder.ts` (hook nuevo, compartido) — grabación real vía
   `getUserMedia`+`MediaRecorder` (formato preferido `audio/webm;codecs=opus`,
   con fallback), onda calculada por RMS real de la señal (`AudioContext` +
   `AnalyserNode`), no simulada. Reemplaza dos copias decorativas duplicadas
   (una en `VoiceRecorder.tsx`, ahora eliminado por no usarse; otra inline en
   `MessageComposer.tsx`).
2. `chats.ts`: `uploadVoiceNote(chatId, blob)` sube el audio al bucket
   privado `voice-notes` en la ruta `chat/{chatId}/{uuid}.ext` — coincide
   exactamente con la política RLS existente (segmento literal `chat` +
   `chatId` como carpeta). `insertVoiceMessage(...)` inserta la fila real en
   `messages` con `type: "voice"`, espejo exacto de `insertTextMessage`.
3. `useChats.ts`: `reconcileSentVoiceNote` — mismo patrón optimista+reconcile
   que el texto (ADR previo): burbuja local inmediata con
   `URL.createObjectURL(blob)`, luego sube y confirma en segundo plano; si
   falla la subida, el mensaje pasa a `status: "failed"` en vez de quedarse
   "enviando" para siempre.
4. `VoiceNotePlayer.tsx` — reproductor `<audio>` real. El bucket es privado,
   así que `media_url` guarda la RUTA de Storage, no una URL pública; la
   reproducción resuelve una URL firmada (`createSignedUrl`, TTL 1h) **bajo
   demanda al tocar play**, no precargada para todo el historial del chat —
   evita llamadas innecesarias a Storage y problemas de expiración.

## Verificación real

- Revisión directa de la política RLS del bucket `voice-notes` (vía MCP de
  Supabase) contra la convención de ruta implementada — coinciden
  exactamente (`chat/{chatId}/...`).
- `bun run typecheck` — limpio.
- `bun run lint` — limpio (solo advertencias preexistentes no relacionadas).
- `bun run build` — build de producción completo, sin errores.
- No se verificó grabación/reproducción de audio en un navegador real dentro
  de este entorno (sandbox sin micrófono/dispositivo de audio) — pendiente
  de prueba manual por el fundador en su máquina o dispositivo Android.

## Fuera de alcance de este slice

- Notas de voz en grupos (mensajería de grupo sigue sin ser real, fuera de
  este ADR).
- Reproducción precargada/caché de URLs firmadas entre sesiones.
