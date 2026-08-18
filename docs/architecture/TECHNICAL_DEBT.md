# TECHNICAL_DEBT.md

Riesgos y deuda detectados en la auditoría inicial (2026-08-18). Ninguno bloquea
empezar a trabajar, pero deben quedar registrados antes de construir encima.

## 1. Gestor de paquetes inconsistente

**Resuelto 2026-08-18 (parcialmente):** el usuario instaló `bun` localmente. Pero el
`bun.lock` original de Lovable resolvía los paquetes contra su **proxy privado**
(`europe-west1-npm.pkg.dev/lovable-core-prod/...`), no contra el registro público de
npm. Eso pasó inadvertido en instalaciones normales (`bun install` cae de vuelta al
registro público si no puede alcanzar el proxy), pero **rompía GitHub Actions** en
segundos con un 403, porque `bun install --frozen-lockfile` sí exige esa URL exacta y
GitHub Actions no tiene acceso a la infraestructura de Lovable. Se regeneró `bun.lock`
desde cero (`rm bun.lock && bun install`) contra el registro público — verificado que
ya no queda ninguna referencia a `npm.pkg.dev`, y que `lint`/`typecheck`/`build` siguen
pasando con las versiones nuevas (dentro de los rangos `^` que ya tenía `package.json`).
Ver `docs/decisions/README.md` (entrada 2026-08-18, CI).

`npm` sigue sin ser la herramienta recomendada para este proyecto (usar siempre `bun`).

## 2. Sin verificación automática ejecutada todavía

Esta auditoría **no pudo ejecutar** `npm install`, `lint`, `typecheck` ni `build` porque
el puente a la máquina del usuario limita cada comando a ~45 segundos, insuficiente para
instalar ~40 dependencias. Comandos pendientes de correr manualmente:

```bash
cd proyecto-mensajeria
npm install   # o: bun install
npm run lint
npm run build
```

No se debe asumir que el proyecto compila limpio hasta confirmar esto.

## 3. Sin script `typecheck` ni suite de tests

`package.json` no define `typecheck` (solo `lint`, `build`, `format`, `dev`, `preview`).
TypeScript estricto está configurado (`tsconfig.json`), pero nada lo corre de forma
aislada y rápida (`tsc --noEmit`). No hay `vitest`/`jest`/`playwright` instalado — cero
tests automatizados. Antes de cerrar cualquier tarea según el DoD de `CLAUDE.md` §13,
esto es una brecha real, no un detalle menor.

## 4. Routing real casi vacío

`src/routes/` solo tiene `index.tsx` y `__root.tsx` pese a usar TanStack Router (que
soporta rutas tipadas por archivo). La navegación entre pantallas ocurre hoy por estado
de React, no por URL. Esto significa: sin deep-linking, sin "volver" nativo del
navegador, sin compartir un link a una pantalla concreta. No es un bloqueo para el MVP,
pero si se integra voz con comandos tipo "abre el chat de Carlos", convendría que eso
resuelva a una URL real, no solo a estado en memoria.

## 5. Dos sistemas de "skills" coexistiendo sin conflicto pero sin relación

`proyecto-mensajeria/.workspace/skills/` (skills internas de Lovable: `premium-ui-design`,
`secure-rbac-routing`, `colombian-compliance-data`, `pre-build-plan`) y
`.claude/skills/puntos-movilidad-engineering/` (la Skill de este proyecto) son sistemas
distintos de herramientas distintas. No hay que fusionarlos ni que uno lea al otro; se
deja constancia para que no se confundan en una auditoría futura.

## 6. Historial de git no refleja la reorganización de documentos como "mover"

El único commit existente (`chore: primer commit — documentación y assets de CoPiloto`)
es anterior a la reorganización de `CLAUDE.md`/Skill/`docs/`. `git status` ve los
archivos movidos (`Ficha-04-CoPiloto.md`, `Orden-Frontend-Lovable-CoPiloto.md`,
`Especificacion-Backend-Supabase-CoPiloto.md`) como "deleted" en su ubicación vieja y
"untracked" en la nueva, en vez de como un rename. No afecta el contenido, pero conviene
que el usuario revise `git status` y decida cuándo y cómo commitear (no se hizo commit
automáticamente en esta sesión).

## 7. Decisiones de producto aún abiertas (bloquean, no técnicamente, pero sí en secuencia)

- Proveedor de SMS/OTP.
- Protección de propiedad intelectual/patente — marcada como prioridad, sin resolver;
  no debería seguir escalándose visibilidad pública del producto sin esto claro.

~~Confirmación de que el proyecto Supabase real ya fue creado por el usuario.~~
**Resuelto 2026-08-18:** el proyecto "Copiloto" (`wrkuusacwkdazfwynhkz`,
`ca-central-1`) ya existe, está `ACTIVE_HEALTHY`, y desde esa misma tarde tiene el
esquema completo aplicado (13 tablas + RLS + storage). Ver
`docs/decisions/ADR-0001-esquema-backend.md`.

## 8. Riesgo residual aceptado en las funciones helper de RLS

`is_chat_participant`, `is_chat_admin`, `is_contact_of` y `can_view_status` son
`security definer` y el advisor de seguridad de Supabase las marca (WARN) como
ejecutables por `authenticated` vía RPC directo. Se revocó `EXECUTE` de `anon`/`public`
(un usuario sin sesión no puede llamarlas). Un usuario ya autenticado sí podría invocar,
por ejemplo, `is_chat_participant('<uuid-ajeno>')` para confirmar si pertenece a un chat
cuyo ID no conocía — un "oráculo de existencia" de bajo riesgo real porque los IDs son
UUID v4 no enumerables, pero no es cero. Es el patrón estándar de Supabase para este
tipo de función (se necesita `EXECUTE` de `authenticated` para que las políticas RLS del
propio usuario se evalúen); se documenta como aceptado, no se persigue más por ahora.

## 9. Pendiente visual: favicon/logo por defecto de Lovable

Confirmado (2026-08-18) y en cola para "más adelante" por pedido del fundador — no se
toca todavía: `proyecto-mensajeria/public/favicon.ico` es el ícono por defecto que trae
Lovable (un corazón con gradiente naranja→azul), no un ícono propio de Copiloto. Es lo
que aparece en la pestaña del navegador al abrir la app. Revisado el resto del código
(componentes, `vite.config.ts`, el paquete `@lovable.dev/vite-tanstack-config`): no hay
ningún otro logo o watermark de Lovable inyectado en la UI — solo el favicon. Para
quitarlo hace falta un ícono real de Copiloto (256×256, `.ico` o `.png`); en cuanto se
tenga el diseño de marca, se reemplaza ese único archivo.

## 10. Almacenamiento de sesión de Auth: en memoria (temporal, a propósito)

**2026-08-18.** `src/lib/supabase/client.ts` guarda la sesión de Supabase Auth en un
adapter **en memoria**, no en `localStorage`. Motivo: la regla de seguridad del
fundador prohíbe `localStorage` para datos sensibles, y el plan a largo plazo
(`@capacitor/preferences`, almacenamiento nativo seguro) **también cae a
`localStorage` en la web** hasta que la app se empaquete de verdad con Capacitor — es
decir, usarlo hoy no resolvería el problema, solo lo escondería. Costo aceptado: la
sesión no sobrevive a un refresh de página durante esta fase de pruebas (hay que
volver a pedir el OTP). Reemplazar por `@capacitor/preferences` en cuanto exista el
empaquetado nativo real — ver `docs/decisions/README.md`.

## 11. `completeOnboarding()` sin UI de error

**2026-08-18.** `completeOnboarding()` en `AppStore.tsx` ahora es async y puede
fallar (sin sesión activa, error de Postgres al guardar `profiles`, etc.). Por ahora
el único manejo es un `console.error` en `src/routes/index.tsx` — no hay pantalla ni
mensaje visible para el usuario si falla. Aceptado como corte de alcance de esta
iteración (el flujo feliz con Test OTP funciona de punta a punta); pendiente antes de
producción.

## 12. Atajo de "números de prueba" para OTP (TEMPORAL, quitar antes de producción)

**2026-08-18.** Se confirmó que la función "Test OTP" de Supabase Auth **no existe
para proyectos en la nube** (solo aplica a instalaciones self-hosted vía variable de
entorno `SMS_TEST_OTP` — documentado únicamente en la guía de self-hosting). El
Dashboard del proyecto "Copiloto" no tiene esa sección; solo permite configurar un
proveedor de SMS real (Twilio/MessageBird/Vonage/Textlocal).

Mientras se decide o se paga un proveedor real, `src/lib/actions/auth.ts` incluye un
atajo: una lista de números fijos (`VITE_DEV_TEST_PHONES` en `.env.local`, nunca
commiteado) que, en vez de pedir un SMS real, inician sesión en una cuenta "sombra"
con email+password sintéticos generados a partir del número — sigue siendo un usuario
y una sesión 100% reales de Supabase Auth (RLS funciona igual), solo que ningún SMS
se envía. Hoy solo tiene el número del fundador (`+573024330410`); se puede agregar
hasta un puñado más para las pruebas de mensajería con otras personas.

**Riesgo aceptado:** las variables `VITE_*` quedan visibles en el bundle de JS que se
sirve al navegador. Aceptable solo porque el proyecto hoy se prueba en local
(`bun run dev`) entre el fundador y personas de confianza — **si esto se despliega
alguna vez en una URL pública, hay que quitar este atajo primero** (o moverlo a una
función server-side/Edge Function que no exponga la lista en el cliente).

**Depende de:** que el proveedor "Email" del proyecto tenga desactivado "Confirm
email" en el Dashboard (Authentication → Providers → Email) — si sigue activo, el
primer inicio de sesión con un número de prueba falla con un mensaje que lo indica
explícitamente (ver `signInDevShadowUser` en `auth.ts`).

**Resuelto y confirmado funcionando de punta a punta — 2026-08-18.** Se diagnosticaron
y corrigieron tres problemas encadenados que impedían usar el atajo:

1. `signInDevShadowUser` mostraba el error genérico de `signInWithPassword`
   ("Invalid login credentials") en vez del error real de `signUp`, escondiendo la
   causa de fondo. Corregido: ahora prioriza `signUp.error` cuando no se creó ningún
   usuario.
2. El dominio sintético original (`dev-<numero>@copiloto.test.internal`) es
   rechazado por Supabase Auth con "Email address is invalid" — los dominios de
   prueba tipo `.test`/`.internal` no pasan su validación. Corregido: la cuenta
   sombra ahora usa un alias `+` sobre un correo real y propio (configurable vía
   `VITE_DEV_SHADOW_EMAIL_BASE` en `.env.local`), ej.
   `correo+dev-<numero>@gmail.com` — dominio válido, y si algún día se reactivara
   "Confirm email" el correo llegaría a una bandeja real.
3. El proveedor **"Email" estaba deshabilitado por completo** en Authentication →
   Sign In / Providers del Dashboard (no solo "Confirm email" activo) — por eso
   cualquier `signUp` fallaba con "Email signups are disabled" sin importar el
   dominio. Se habilitó el proveedor Email y se desactivó "Confirm email" en el
   Dashboard (paso manual, no versionable).

Verificado con SQL directo contra el proyecto: el número de prueba `+573024330410`
generó una sesión real de Supabase Auth y una fila real en `public.profiles` (con
`display_name` y `email` capturados en el onboarding), confirmando el flujo completo
teléfono → OTP → correo → perfil → permisos → `completeOnboarding()`.

## 13. Mensajería real conectada a Supabase (contactos, chats 1-a-1, mensajes de texto) — 2026-08-18

Se implementó el MVP de mensajería real (contactos por teléfono, chats 1-a-1,
mensajes de texto con Realtime y confirmación de lectura), reemplazando los datos
100% simulados de `mock-data.ts` para estas tres capas. **Sigue simulado** (no
sincronizado con Supabase todavía): notas de voz, fotos/documentos, ubicación,
reacciones, grupos, silenciar/fijar/archivar, mensajes que desaparecen,
reenviar/editar/borrar.

**Bug de RLS encontrado y corregido en el camino.** La política de INSERT de
`chat_participants` (`chat_participants_insert`) verificaba "¿soy el creador de
este chat?" con un `EXISTS (SELECT 1 FROM chats ...)` directo. Ese `EXISTS` corre
con los permisos del usuario que hace la petición (no bypassa RLS), y la política
de SELECT de `chats` (`chats_select_participant`) exige ya ser participante del
chat vía `is_chat_participant()` — que es exactamente lo que el INSERT está
intentando crear. Resultado: trampa circular, 403 permanente al intentar crear
cualquier chat 1-a-1 nuevo (el botón "Enviar mensaje" no hacía nada visible).

Diagnosticado con `mcp__Supabase__query_logs` sobre `edge_logs` (HTTP 403 real en
`POST /rest/v1/chat_participants`) y confirmado de forma determinística
simulando la política con `SET LOCAL ROLE authenticated` + `SET LOCAL
request.jwt.claims` dentro de una transacción de prueba (con `ROLLBACK`, sin
dejar datos). Corregido agregando `is_chat_creator(p_chat_id uuid)` — función
`SECURITY DEFINER STABLE` con `search_path` fijo, igual patrón que
`is_chat_participant`/`is_chat_admin` — que sí puede leer `chats` sin depender de
que el registro de `chat_participants` ya exista. Migración:
`supabase/migrations/20260818221803_fix_chat_participants_insert_rls_recursion.sql`
(ya aplicada en el proyecto Supabase real).

**Lección para futuras políticas RLS de este proyecto:** cualquier `WITH CHECK`
o `USING` que necesite leer OTRA tabla con RLS propia debe hacerlo a través de una
función `SECURITY DEFINER` (como ya se hace con `is_chat_participant`/
`is_chat_admin`/`is_contact_of`/`can_view_status`), nunca con un `EXISTS`/subquery
directo — de lo contrario queda sujeto a la RLS de esa otra tabla y puede crear
ciclos irresolubles.

## 14. Estado de lectura (chulos dobles) inconsistente al entrar a un chat desde afuera — PAUSADO a pedido del fundador — 2026-08-18

**Síntoma reportado:** al estar fuera de un chat, llegar un mensaje nuevo, y luego
entrar a ese chat y leerlo, los chulos no siempre pasan a "leído" (doble chulo
verde). El fundador reporta que a veces se queda en un solo chulo. También
reportó (sin verificar aún) que el color pudo haber quedado invertido
(verde = visto, rojo = no visto es el diseño pedido).

**Diagnóstico realizado antes de pausar:**
- Se revisó `edge_logs` vía `query_logs`: los `POST /rest/v1/message_status`
  (la llamada real de `markChatReadRemote`) dejaron de intentarse por completo
  después de cierto punto en el tiempo — es decir, el cliente nunca llegó a
  invocar la llamada de red; no es un rechazo del servidor (403/RLS), porque
  no hay ningún intento registrado.
- Se releyeron `openChat` (en `useChats.ts`), el nuevo `useEffect` en
  `ChatThreadScreen.tsx` que re-dispara `openChat` cuando hay mensajes sin
  leer del otro participante, y los tres call-sites de `onOpenChat` en
  `ChatsTab.tsx` y `ChatListScreen.tsx`. Todos enrutan correctamente a
  `controller.openChat(chatId)` — no se encontró un bug obvio de lógica en
  revisión estática de código.
- No fue posible aislar la causa exacta sin acceso a la consola del navegador
  del fundador en el momento del bug (breakpoints/logs en vivo).

**Instrumentación agregada (commit `e3f9f34`)** para facilitar el próximo
diagnóstico: `markChatReadRemote` y `markMessagesDeliveredRemote` ahora
capturan y hacen `console.error` de cualquier error de Supabase en vez de
ignorarlo silenciosamente. La próxima vez que se reproduzca el bug, revisar la
consola del navegador debería decir si la llamada se intentó y falló (y por
qué) o si simplemente nunca se disparó.

**Nota sobre el reporte de "los chulos dobles salen cuando haces cambios por
allá" (es decir, cuando se hacen escrituras/pruebas desde el lado de Supabase
directamente):** es probablemente solo un efecto colateral de las pruebas de
verificación en base de datos durante el desarrollo (escrituras directas de
`message_status` para simular el flujo), no evidencia de la causa real del
bug. No se debe sobre-interpretar como pista definitiva sin repetir la prueba
de forma controlada.

**Color rojo/verde:** el código actual (`StatusTicks` en
`MessageBubble.tsx`) es `status === "read" ? "text-success" : "text-destructive"`,
que en una lectura del código es correcto para verde=visto / rojo=no visto.
El reporte de inversión no se ha podido confirmar contra una captura de
pantalla real; queda pendiente verificar en vivo antes de asumir que el
código está invertido.

**Decisión:** el fundador indicó explícitamente pausar este bug ("deja eso
ahi quieto ya, dejalo anotado para corregir") para priorizar trabajo de mayor
valor. No se debe seguir intentando corregir esto hasta que se retome
explícitamente, momento en el cual se debe empezar por revisar la consola del
navegador en una reproducción en vivo (gracias a la instrumentación ya
agregada) en vez de seguir adivinando desde el código estático.
