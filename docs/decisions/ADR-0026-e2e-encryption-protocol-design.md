# ADR-0026 — Protocolo de cifrado de extremo a extremo (diseño, sin código todavía)

**Fecha:** 2026-08-19
**Estado:** Propuesto — diseño aceptado en su forma general por el fundador
(pidió explícitamente "la definición del protocolo", no implementación
todavía). Cero código de cifrado escrito en este ADR; es la base para
implementarlo en un slice futuro.

## Contexto

Pedido explícito y confirmado dos veces por el fundador: cifrado de extremo
a extremo real para la mensajería, porque "en este momento no nos interesa
leer las conversaciones de las personas". Se le explicó y confirmó
explícitamente la consecuencia arquitectónica ineludible: **E2E real
significa que NI el fundador NI el panel de administración pueden leer el
contenido de un mensaje jamás, ni siquiera con acceso completo de admin.**
No es una limitación a resolver — es la definición misma de "extremo a
extremo". Este ADR asume esa decisión como definitiva.

Estado actual (2026-08-19): cero cifrado. `messages.content` es texto plano
en Postgres, legible por cualquiera con la `service_role_key` (el backend
NestJS, cualquier admin de Supabase, y las tools de asistente
`read_messages`/`send_message` de ADR-0018).

## Decisión de alcance (v1)

**Alcance explícito de v1:**
- Solo chats 1 a 1 (igual que el resto de mensajería real hoy — grupos
  siguen siendo simulación local, ADR-0018/0024/0025). Cifrado de grupo es
  un problema distinto y más difícil (distribución de claves a N
  miembros, manejo de altas/bajas) — se difiere a un ADR propio cuando los
  grupos sean reales.
- Solo el campo `content` de `messages` (texto). Voz/fotos/ubicación NO se
  cifran en v1 — quedan como están hoy (Storage privado + RLS, que ya
  protege contra terceros no participantes, aunque no contra el propio
  backend). Cifrar adjuntos es una extensión natural de v2 pero no bloquea
  el pedido del fundador sobre "conversaciones".

**Fuera de alcance explícito de v1 (documentado como decisión de producto,
no como olvido):**
- Multi-dispositivo: si el fundador inicia sesión en un celular Y una
  tablet, cada dispositivo necesitaría su propia identidad o un mecanismo
  de sincronización de claves entre dispositivos — no resuelto en v1. v1
  asume **un dispositivo activo por usuario**.
- Backup/recuperación de claves: si el usuario pierde el dispositivo (o
  borra datos de la app) sin haber hecho backup, el historial de mensajes
  cifrados queda **permanentemente indescifrable** — es la contraparte
  inevitable de que ni siquiera el backend pueda ayudar a recuperarlo. Se
  documenta como riesgo aceptado, no como bug.
- Forward secrecy perfecta (Double Ratchet estilo Signal) — ver "Elección
  de protocolo" abajo.

## Elección de protocolo

Dos caminos reales, evaluados:

1. **Signal Protocol completo (X3DH + Double Ratchet)** — el estándar de la
   industria (Signal, WhatsApp). Da forward secrecy perfecta (comprometer
   una clave no expone mensajes pasados) y post-compromise security. Costo
   real: es significativamente más complejo de implementar e integrar
   correctamente a mano; la librería de referencia (`libsignal`) tiene
   bindings de Node/nativo pero soporte WASM para navegador limitado/no
   oficial a la fecha de este documento — típicamente se usa dentro de apps
   nativas (Signal, WhatsApp), no tanto en apps web puras.
2. **NaCl `crypto_box` (X25519 + XSalsa20-Poly1305) vía `libsodium.js`,
   con un par de claves de identidad por usuario** — cifrado autenticado de
   clave pública, cada mensaje cifrado directamente con la clave pública del
   destinatario. Librería madura, auditada, con bindings WASM oficiales que
   sí funcionan bien en navegador (`libsodium-wrappers`). Sin forward
   secrecy por mensaje (si la clave privada de un usuario se compromete,
   TODOS sus mensajes pasados y futuros quedan expuestos hasta que rote la
   clave) — pero cumple el requisito central del fundador: **nadie del lado
   del servidor puede leer el contenido**, punto.

**Decisión: opción 2 (`libsodium.js`, `crypto_box`) para v1.** Motivo:
entrega el requisito real pedido (el operador no puede leer mensajes) con
una superficie de implementación mucho más chica y auditable, usando una
librería madura en vez de escribir Double Ratchet a mano — más alineado con
"REUSE > EXTEND > REFACTOR > REPLACE" y con evitar complejidad sin evidencia
de necesitarla todavía. Se documenta el upgrade a Double Ratchet como v2
explícito si en el futuro se necesita forward secrecy (ej. si el modelo de
amenaza pasa a incluir "un atacante que compromete un dispositivo y quiere
leer conversaciones pasadas").

## Diseño propuesto

### Identidad y claves

- Al primer login de cada usuario, el cliente genera un par de claves
  X25519 (`crypto_box_keypair()` de libsodium) **en el navegador/dispositivo,
  nunca en el servidor**.
- La clave pública se sube a una tabla nueva `user_encryption_keys`
  (`user_id` PK/FK a `profiles`, `public_key` bytea/text, `created_at`) —
  es segura de exponer en texto plano (una clave pública no es secreta) y
  con RLS de solo-lectura para cualquier usuario autenticado (necesitas la
  clave pública de X para cifrarle un mensaje).
- La clave PRIVADA nunca sale del dispositivo. Almacenamiento interino
  mientras la app es solo web (mismo patrón ya usado para la sesión de auth,
  ver `src/lib/supabase/client.ts`): `IndexedDB` (no `localStorage`, mismo
  motivo de seguridad ya documentado para la sesión). Cuando exista
  empaquetado nativo (Android, ya decidido — ver `MISSING_CAPABILITIES.md`),
  migra a almacenamiento seguro nativo (`@capacitor/preferences` +
  Android Keystore vía un plugin de secure storage), igual que está
  planeado para el token de sesión.

### Envío de un mensaje

1. El cliente obtiene la clave pública del destinatario (`user_encryption_keys`,
   cacheada localmente tras la primera vez — no cambia salvo rotación).
2. Cifra `content` con `crypto_box_easy(content, nonce, recipientPublicKey,
   senderPrivateKey)` → produce `ciphertext` + `nonce` (ambos se guardan,
   el nonce NO es secreto).
3. Inserta la fila en `messages` con columnas nuevas: `content_ciphertext`
   (bytea/base64), `content_nonce` (bytea/base64), `is_encrypted: true`.
   `content` (el campo de texto plano actual) se deja `NULL` para mensajes
   cifrados — así una fila vieja (`is_encrypted: false`, `content` con
   texto) y una nueva (`is_encrypted: true`, `content: null`) conviven en la
   misma tabla sin migrar el historial.
4. El destinatario, al leer, descifra con `crypto_box_open_easy(ciphertext,
   nonce, senderPublicKey, recipientPrivateKey)` — client-side, nunca en el
   backend.

### Cómo el asistente sigue pudiendo leer mensajes en voz alta con E2E real (resuelto 2026-08-19)

Las tools `read_messages`/`send_message` (ADR-0018) hoy leen/escriben
`messages.content` en texto plano desde el backend NestJS. Con E2E real,
el backend **ya no puede leer el contenido cifrado** — es exactamente el
comportamiento pedido. La solución no es renunciar a que el asistente lea
mensajes: es separar el flujo en dos carriles, según quién necesita ver el
texto real del mensaje.

**Carril 1 — comandos y envíos (sin cambios, ya construido en ADR-0016):**
todo lo que hoy pasa por el Tool Registry en la nube (interpretar "Estefa,
mándale un mensaje de voz a Jason", calcular una ruta, activar el corredor
de emergencia) sigue funcionando igual. Ninguna de estas acciones necesita
leer el contenido de un mensaje ya cifrado — "enviar" es escribir, no leer,
y el cliente cifra ANTES de que el mensaje salga del dispositivo, así que la
nube nunca ve el texto en claro tampoco hoy en ese sentido.

**Carril 2 — nuevo, solo para "léeme mis mensajes":** el reconocimiento de
la frase del usuario ("léeme el último mensaje de Jason") sí puede seguir
pasando por el motor de voz en la nube — esa frase no es secreta, es un
comando, igual que "actívame el corredor de emergencia". Lo que cambia es
QUÉ pasa después: en vez de que el backend busque el mensaje y se lo lea al
motor de voz en texto plano (como sería hoy sin cifrado), el propio
dispositivo — que ya tiene la llave privada, porque es el dueño de la
conversación — descifra el mensaje ahí mismo y se lo entrega directamente al
sintetizador de voz DEL TELÉFONO (el mismo motor que ya usan los lectores de
pantalla y las notificaciones leídas en voz alta de Android/el navegador,
`speechSynthesis` / TTS nativo). El contenido descifrado nunca sale del
dispositivo ni toca ningún servidor, ni el de Neggo ni el de ningún
proveedor de IA — es una lectura 100% local, técnicamente idéntica a que el
teléfono te lea una notificación.

En corto: **la nube decide "hay que leer un mensaje" (comando), pero
descifrar y leer en voz alta el contenido en sí lo hace el teléfono solo,
sin mandarlo a ningún lado.** Esto mantiene el E2E intacto (nadie del lado
del servidor ve el contenido, en ningún momento) y sí cumple lo que el
fundador describió en su ejemplo de flujo de voz.

Implicación técnica para cuando se construya (fuera de este ADR, que sigue
siendo solo diseño): la app cliente necesita su propia función de "leer en
voz alta" que NO dependa de mandarle texto al backend — usa el resultado ya
descifrado que el cliente ya tiene en memoria (porque lo descifró para
mostrarlo en pantalla) y lo pasa directo a `speechSynthesis` del navegador
(o al TTS nativo de Android una vez empaquetado). El Tool Registry solo
necesita devolver "cuál mensaje leer" (su id), nunca su contenido.

## Migración / despliegue

- Nueva tabla `user_encryption_keys` + columnas nuevas en `messages`
  (`content_ciphertext`, `content_nonce`, `is_encrypted`) — migración
  aditiva, no rompe nada existente.
- Rollout: cifrado aplica solo a mensajes nuevos a partir del momento en que
  se implemente — el historial ya escrito en texto plano se queda como está
  (ya estuvo expuesto; cifrarlo retroactivamente no deshace esa exposición y
  requeriría que el backend tuviera acceso a las claves privadas, lo cual
  violaría el objetivo mismo).
- `is_chat_participant()` y el resto de RLS de `messages` no cambian — el
  cifrado es una capa encima, no un reemplazo de la autorización existente.

## Próximo paso (no incluido en este ADR)

Implementación real: migración de esquema, integración de
`libsodium-wrappers` en el frontend, generación/almacenamiento de claves,
cifrado/descifrado en el flujo de envío/lectura ya existente
(`insertTextMessage`/`mapMessageRow`), y una decisión explícita del
fundador sobre el punto de "lectura por voz de un mensaje cifrado" de
arriba. Se recomienda como un ADR de implementación propio (ADR-0027 o
posterior) cuando el fundador confirme que quiere pasar de diseño a
código.
