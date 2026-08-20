# ADR-0028 — Persistencia real del perfil (nombre, "acerca de", foto)

**Fecha:** 2026-08-20
**Estado:** Aceptado — verificado con RLS real (simulación transaccional
con JWT real, revertida, cero datos persistidos), `typecheck`/`lint`/`build`
limpios en frontend. Cero migraciones nuevas (REUSE puro del esquema
`profiles`/bucket `avatars` de ADR-0001).

## Contexto

Bug real descubierto durante la auditoría de ADR-0027 (activación del
asistente por nombre personalizado): al revisar cómo se identificaría al
usuario para el nombre del asistente, se encontró que `useProfile.ts` nunca
persistía los cambios de perfil — `updateProfile` solo llamaba
`updateCurrentUser`, que actualiza el estado en memoria de `AppStore`, sin
ningún `UPDATE` real a Supabase. Nombre visible, "acerca de" y foto de
perfil se perdían silenciosamente al recargar la app o cerrar sesión.

No es parte del pedido explícito de ninguna sesión anterior, pero se marcó
como valor independiente (no solo prerrequisito de otra feature) y se
priorizó al pausar la parte de nombre personalizado del asistente (ver
"Cambio de alcance" en ADR-0027) — el fundador pidió continuar con trabajo
pendiente que siguiera dando valor real.

Auditoría (Discover): el esquema original (ADR-0001) ya tenía todo lo
necesario, sin ningún gap de infraestructura:
- Tabla `profiles` con columnas `display_name`, `about`, `avatar_url` y
  política RLS `profiles_update_self` (`UPDATE`, `id = auth.uid()`).
- Bucket de Storage `avatars`, público, con políticas
  `avatars_owner_write` / `avatars_owner_update` / `avatars_owner_delete`
  (solo a la ruta `{auth.uid()}/...`) y `avatars_public_read`.

## Decisión

**REUSE puro — cero migraciones.** Se construyó:

1. `updateProfileRemote(userId, patch)` en `lib/actions/profile.ts` — hace
   `UPDATE profiles SET display_name/about ... WHERE id = userId`; RLS ya
   exige que `userId` sea el propio usuario autenticado. Si no hay cambios
   reales en el patch (objeto vacío), no llama a Supabase.
2. `uploadAndSaveAvatar(userId, file)` — sube el archivo real a
   `avatars/{userId}/{uuid}.{ext}` (mismo patrón de ruta que
   `uploadVoiceNote` en ADR-0024), obtiene la URL pública real
   (`getPublicUrl`, el bucket es público — a diferencia de `voice-notes`
   que usa `createSignedUrl` por ser privado) y guarda esa URL en
   `profiles.avatar_url`. Si la subida o el guardado fallan, devuelve
   `null` sin tocar el estado local.
3. `useProfile.ts`:
   - `updateProfile` sigue actualizando el estado local primero
     (optimista, misma UX de siempre — no bloquea la UI esperando la red),
     y ahora además dispara `updateProfileRemote` en paralelo (mismo patrón
     ya usado en `useChats.ts` para mensajes: optimista + reconciliación).
   - Nueva función `updateAvatar(file)`: muestra una vista previa
     inmediata con `URL.createObjectURL(file)` (UX instantánea), sube el
     archivo real, y al terminar reemplaza la vista previa por la URL
     pública real ya persistida.
4. `ProfileScreen.tsx`: el input de foto ahora llama a `updateAvatar(file)`
   en vez de solo generar una URL local descartable.

## Verificación real

- Lectura directa de las políticas RLS de `profiles` y del bucket
  `avatars` (vía MCP de Supabase) antes de escribir cualquier código —
  confirmado que ya cubrían este caso sin cambios.
- Simulación transaccional con JWT real (mismo patrón de ADR-0018/ADR-0025)
  contra dos cuentas reales de `profiles`, **revertida en cada corrida
  (`rollback`), cero filas dejadas**:
  - usuario actualiza su propio `display_name`/`about`/`avatar_url` → OK,
    1 fila afectada, valores reflejados correctamente.
  - el mismo usuario intenta `UPDATE` sobre el perfil de otra persona
    (simula un intento de modificar una cuenta ajena) → bloqueado por RLS,
    0 filas afectadas, el perfil ajeno queda intacto.
  - confirmado después con un `SELECT` fuera de cualquier transacción:
    ambos perfiles muestran sus valores originales, sin rastro de la
    prueba.
- `bun run typecheck` / `lint` / `build` (build de producción completo) —
  limpios.
- No se probó la subida real de un archivo de imagen desde un navegador
  dentro de este entorno (sandbox sin acceso a cámara/galería) — pendiente
  de prueba manual del fundador.

## Fuera de alcance de este slice

- Borrar la foto anterior del bucket al subir una nueva (hoy se acumulan
  archivos huérfanos en `avatars/{userId}/`; no afecta funcionalidad, solo
  almacenamiento — se puede resolver después con una limpieza periódica o
  al momento de subir).
- Validación de tamaño/dimensiones de la imagen antes de subir.
- El nombre personalizado del asistente que motivó descubrir este bug sigue
  suspendido (ver ADR-0027) — esta persistencia ya no bloquea esa feature
  si se retoma, pero se construyó por su valor propio, no como
  prerrequisito.
