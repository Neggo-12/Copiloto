# ADR-0025 — Ubicación real (puntual y en vivo) en mensajería

**Fecha:** 2026-08-19
**Estado:** Aceptado — verificado con RLS real (simulación transaccional
con JWT real, revertida, cero datos persistidos), `typecheck`/`lint`/`build`
limpios en frontend. Una migración real y mínima aplicada al proyecto
Supabase vivo (`wrkuusacwkdazfwynhkz`).

## Contexto

Segundo pedido explícito del fundador de esta tanda (junto con notas de voz
—ADR-0024— y cifrado E2E): "Envío de ubicación: (a) ubicación actual, (b)
ubicación en tiempo real con opciones de 15 minutos / 1 hora / 8 horas".

Auditoría (Discover): `MOCK_CURRENT_LOCATION` era una constante fija
(Chapinero, Bogotá) que se usaba tanto para "ubicación actual" como para
"ubicación en vivo" — ninguna de las dos leía el GPS real, y la
"actualización en vivo" no existía: el mensaje se creaba una sola vez con
una fecha de vencimiento, sin ninguna posición nueva llegando después.

Hallazgo de REUSE, igual que en ADR-0024: el esquema original (ADR-0001) ya
tenía todo lo necesario — `messages.type` incluye `"location"`, y la tabla
`location_shares` (`message_id` FK 1 a 1, `latitude`/`longitude`,
`address_label`, `is_live`, `live_duration_minutes`, `live_expires_at`,
`stopped_at`) con RLS ya aplicada:
- `location_shares_insert`: solo el remitente del mensaje.
- `location_shares_select`: solo participantes del chat.
- `location_shares_update_sender`: solo el remitente (habilita subir
  posiciones nuevas mientras la ubicación está en vivo).

Único gap real de infraestructura encontrado: `location_shares` no estaba en
la publicación `supabase_realtime` (`messages`/`chats`/`chat_participants`/
`message_status` sí lo estaban) — sin esto, ni la posición inicial ni las
actualizaciones en vivo le habrían llegado al otro usuario sin refrescar.

## Decisión

**REUSE + una migración mínima.** Una sola sentencia nueva:

```sql
alter publication supabase_realtime add table public.location_shares;
```

Se construyó:

1. `getRealCurrentPosition()` — GPS real vía
   `navigator.geolocation.getCurrentPosition`, sin fallback simulado; si el
   navegador no lo soporta o el usuario niega el permiso, se propaga un
   error real al usuario (`locationError` en `useChats`), nunca una
   coordenada inventada.
2. `reverseGeocodeAddress(lat, lng)` — llama al backend NestJS real
   (`GET /navigation/reverse-geocode`, Google Geocoding, ya construido y
   verificado en ADR-0010) para la etiqueta de dirección; si falla, el
   mensaje se manda igual sin etiqueta (no bloquea el envío por un problema
   de geocodificación).
3. `insertLocationMessage(...)` — inserta `messages` (`type: "location"`) y
   luego `location_shares` (coordenadas). Si la segunda escritura falla, el
   mensaje se marca `deleted_at` (política `messages_update_own_window`, ya
   existente) en vez de quedar huérfano sin coordenadas — no hay hard-delete
   permitido por RLS sobre `messages`.
4. `updateLiveLocationPosition` / `stopLiveLocationShareRemote` — el emisor
   sube posiciones nuevas (`UPDATE location_shares`) mientras dura la
   ubicación en vivo, y la marca detenida (`stopped_at`) al vencer el
   temporizador local o al tocar "Detener".
5. `useChats.ts`: `navigator.geolocation.watchPosition` real, con throttle a
   una subida cada ~20s (no en cada evento del GPS, para no saturar
   Supabase ni la batería) y un `setTimeout` real que detiene el
   seguimiento al vencer la duración elegida (15 min / 1 h / 8 h). Los
   watchers se limpian al desmontar el hook.
6. Suscripción Realtime nueva sobre `location_shares` (INSERT + UPDATE) en
   el mismo canal ya existente de `useChats.ts` — necesaria porque el INSERT
   del mensaje y el INSERT de `location_shares` son dos escrituras
   separadas (sin transacción entre ellas desde el cliente), así que la
   fila de coordenadas puede llegarle al destinatario un instante después
   del mensaje; el mismo evento UPDATE es lo que hace que el mapa del
   destinatario se mueva en vivo mientras el emisor se desplaza.
7. `MOCK_CURRENT_LOCATION` y las versiones simuladas de
   `shareCurrentLocation`/`startLiveLocation` (en `lib/actions/chats.ts`) se
   eliminaron — reemplazadas por las funciones reales de arriba.

## Verificación real

- Lectura directa de las 3 políticas RLS de `location_shares` (vía MCP de
  Supabase) antes de escribir cualquier código.
- Simulación transaccional con JWT real (mismo patrón que ADR-0018),
  contra el chat 1-a-1 real ya existente entre los dos usuarios de prueba,
  **revertida en cada corrida (`rollback`), cero filas dejadas**:
  - remitente inserta mensaje + `location_shares` → OK.
  - participante NO remitente intenta `UPDATE` (simula un tercero tratando
    de falsificar la posición de otro) → bloqueado, 0 filas.
  - participante SÍ puede `SELECT` → 1 fila visible.
  - remitente actualiza su propia posición (simula una actualización de
    ubicación en vivo) → OK, 1 fila afectada.
  - usuario NO participante intenta `SELECT` → bloqueado, 0 filas.
  - confirmado después de cada corrida: `0` filas de prueba persistidas.
- `location_shares` confirmada en `pg_publication_tables` tras la migración.
- `bun run typecheck` / `lint` / `build` (build de producción completo) —
  limpios.
- No se probó la lectura real del GPS del navegador ni el flujo completo de
  extremo a extremo dentro de este entorno (sandbox sin sensor de
  ubicación) — pendiente de prueba manual del fundador en su navegador o en
  Android.

## Fuera de alcance de este slice

- Miniatura de mapa real (hoy sigue siendo una imagen estática — no es parte
  de este pedido, ver `LocationCard` en `MessageBubble.tsx`).
- Ubicación en vivo dentro de grupos (mensajería de grupo sigue sin ser
  real, mismo límite que ADR-0024).
- Un job de servidor que cierre automáticamente ubicaciones en vivo si el
  emisor cierra la app antes de que venza el temporizador local — hoy el
  cierre depende de que el cliente siga corriendo (mismo tipo de límite ya
  aceptado para el cierre de corredor de emergencia, ADR-0020).
