# ADR-0029 — Presencia en línea, "escribiendo…" y "visto por última vez" reales

**Fecha:** 2026-08-26
**Estado:** Aceptado — verificado con RLS/RPC real (simulación transaccional
con JWT real de dos cuentas reales, revertida, cero datos persistidos),
`typecheck`/`lint`/`build` limpios en frontend. Cero migraciones nuevas
(REUSE puro: `last_seen_at`, `last_seen_visibility` y la función
`is_contact_of` ya existían desde ADR-0001, sin conectar todavía).

## Contexto

Al retomar el pendiente más fácil de la lista acordada con el fundador
("de las más fáciles a las más complejas"), la auditoría encontró que
`chat.activity` (usado para "escribiendo…"/"grabando audio…") siempre valía
`"idle"` para chats reales — solo un dato de demo en `mock-data.ts` lo ponía
en `"typing"`. Peor aún: `useChats.ts` exponía `participants` como
`MOCK_PARTICIPANTS` sin condición alguna — es decir, **el "en línea"/"visto
hace poco" que se veía en cada chat real no tenía ninguna relación con datos
reales**, era 100% decorativo (`isOnline: true` fijo, ver `AppStore.tsx`).

Hallazgo de REUSE, mismo patrón que ADR-0025/ADR-0028: el esquema original
(ADR-0001) ya tenía `profiles.last_seen_at`, `profiles.last_seen_visibility`
(`"everyone"|"contacts"|"nobody"`, default `"everyone"`) y hasta una función
`public.is_contact_of(p_owner_id uuid)` (SECURITY DEFINER, ya con permisos a
`authenticated`) — nada de esto estaba conectado a ningún lado del frontend.

## Decisión

**REUSE total — cero migraciones.** Se construyó:

1. `ChatsState.participants: Record<UserId, UserProfile>` (nuevo, real) —
   `fetchChatsAndMessages`/`fetchParticipantProfile` arman este mapa a
   partir de `profiles` real, en vez de depender de `MOCK_PARTICIPANTS`.
   `useChats.ts` mezcla ambos (`{ ...MOCK_PARTICIPANTS, ...state.participants
   }`) para no romper la demo de Estados (dominio aparte, sigue 100% mock,
   fuera de alcance de este slice).
2. **Presencia en línea real**: un canal de Supabase Realtime Presence
   compartido (`presence:online`); cada cliente hace `track()` al montar,
   el evento `sync` trae el conjunto COMPLETO de quién está conectado ahora
   (nunca un delta, así que no se puede desincronizar por un evento
   perdido) y se refleja en `participants[x].isOnline`.
3. **"Escribiendo…" real**: un canal de Broadcast por chat
   (`chat-typing-{chatId}`), abierto/cerrado según la lista de chats del
   usuario — puramente efímero, nunca se escribe en la base. `notifyTyping`
   (con throttle de ~2s) se dispara desde `MessageComposer` en cada cambio
   del borrador; al recibirlo, el otro lado marca `chat.activity = "typing"`
   por 4s y vuelve solo a `"idle"` si no llega un evento nuevo.
4. **"Visto por última vez" real**: `touchLastSeen(userId)` (nuevo, en
   `profile.ts`, mismo patrón de `updateProfileRemote` de ADR-0028) escribe
   `profiles.last_seen_at = now()` al abrir la app, cada ~2 min mientras la
   pestaña está visible, y al pasar a segundo plano — mismo espíritu de
   throttling que la ubicación en vivo (ADR-0025), aquí con un intervalo
   mucho más largo porque no hace falta más precisión. `formatLastSeen()`
   (nuevo, en `lib/format.ts`) reemplaza el string fijo "visto hace poco"
   por un cálculo real ("hace 5 min", "hace 2 h", fecha/hora si es más
   viejo).
5. **Privacidad de "visto por última vez"** (`last_seen_visibility`,
   respetada por primera vez): `"everyone"` se muestra siempre, `"nobody"`
   nunca, `"contacts"` solo si YO soy contacto real del dueño del perfil —
   pregunta que solo se puede responder con la función `is_contact_of` ya
   existente, porque la RLS de `contacts` es privada
   (`user_id = auth.uid()`) y no hay forma de leer la libreta de contactos
   ajena directamente desde el cliente.

## Verificación real

- Lectura directa del esquema real (`information_schema.columns`,
  `pg_policies`, `pg_proc`) antes de escribir código — así se descubrió que
  `is_contact_of` ya existía (un primer intento de crearla vía migración
  falló con "cannot change name of input parameter", justo por eso: ya
  existía con el parámetro `p_owner_id`).
- Simulación transaccional con JWT real (mismo patrón de ADR-0018/0025/0028)
  contra dos cuentas reales con una relación de contacto real y asimétrica
  (A tiene a B como contacto; B no tiene a A) — **revertida en cada corrida
  (`rollback`), cero filas dejadas**:
  - B preguntando por A (`is_contact_of(A)` con `auth.uid()=B`) → `true`
    (A sí tiene a B en sus contactos).
  - A preguntando por B (`is_contact_of(B)` con `auth.uid()=A`) → `false`
    (B no tiene a A en los suyos) — confirma que la regla es asimétrica y
    correcta, no un simple "¿nos conocemos de algún lado?".
- Confirmado que ambas cuentas reales de prueba siguen en
  `last_seen_visibility = "everyone"` (default de ADR-0001, nunca antes
  conectado a nada) y `last_seen_at = null` (nunca escrito hasta ahora).
- `bun run typecheck` / `lint` / `build` (build de producción completo) —
  limpios. Corrigió de paso un bug real menor y preexistente:
  `deleteChat`/`leaveGroup`/`deleteGroup` construían un `ChatsState` nuevo
  sin *spread* del estado anterior — con el campo `participants` agregado
  esto lo hizo fallar en `tsc`, así que de paso se corrigió para las tres
  funciones (antes de este ADR ya perdían silenciosamente cualquier campo
  de estado no listado a mano al salir de un grupo o borrar un chat).
- No se probó Presence/Broadcast contra dos pestañas de navegador reales
  dentro de este entorno (sandbox sin navegador) — pendiente de prueba
  manual del fundador con dos sesiones reales abiertas a la vez.

## Fuera de alcance de este slice

- `chat.activity = "recording_audio"` sigue sin conectarse a un evento real
  (`useVoiceRecorder.ts` no avisa nada todavía) — mismo tipo de extensión
  que "escribiendo…", solo que sobre el flujo de notas de voz; no se tocó
  para mantener el diff acotado a lo pedido.
- Presencia/"escribiendo…" en grupos (la lista de chats sigue mostrando
  actividad por chat, no por remitente específico dentro de un grupo).
- El mapa de `participants` solo se llena con gente con la que ya hay un
  chat real — un contacto agregado pero sin chat todavía sigue cayendo en
  el respaldo `MOCK_PARTICIPANTS` si aparece en otra pantalla (ej. Estados,
  que sigue siendo 100% simulación local, fuera de alcance).
