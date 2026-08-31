# ADR-0032 — Rate limiting real en el backend

**Fecha:** 2026-08-27
**Estado:** Aceptado — verificado contra un Redis real local (no mock),
usando el paquete real instalado (`@nest-lab/throttler-storage-redis`):
7/7 casos (decodificación de JWT + bloqueo/desbloqueo real por Redis).
`typecheck`/`lint`/`build` limpios.

## Contexto

Siguiente pendiente de la lista fácil→difícil tras ADR-0031 (fotos/
documentos). Ningún endpoint del backend NestJS tenía límite de
peticiones — cualquier cliente (autenticado o no, en el caso de
`/health`/`/system/queue/ping`) podía llamar sin restricción. Dos
endpoints en particular tienen costo real por llamada: `NavigationController`
(cada `route`/`geocode`/`reverse-geocode` gasta cuota real de Google Maps
Platform) y `SimulationController` (cada corrida hace múltiples escrituras
reales a Redis).

## Decisión

`@nestjs/throttler` (v6, el paquete oficial de NestJS) + storage de Redis
real (`@nest-lab/throttler-storage-redis`, community package mantenido,
compatible con `ioredis` v6 y Nest v11 — confirmado contra el `package.json`
real antes de instalar). Se usa Redis como storage — no el default en
memoria del paquete — por la misma razón que ya justificó Redis para
`LocationStateService`/`ReminderCacheService`/BullMQ: si el backend algún
día corre con más de un proceso, contadores en memoria por proceso se
desincronizarían y el límite dejaría de ser real.

**Agrupado por usuario, no por IP** (`UserAwareThrottlerGuard`, nuevo,
extiende `ThrottlerGuard` de la librería): decodifica el `sub` del JWT
Bearer sin verificar su firma, solo como clave de agrupación — la
verificación real de identidad la sigue haciendo `SupabaseAuthGuard` más
adelante en la cadena, este guard nunca autoriza nada. Se descartó agrupar
por IP a propósito: el piloto controlado (Fase 8) prevé decenas/cientos de
conductores en la misma red celular, y el NAT de un operador móvil
frecuentemente hace que compartan la misma IP pública — limitar por IP
penalizaría a usuarios reales inocentes por el tráfico de otro. Detalle
técnico real que obligó a esta decisión: el guard global corre ANTES que
`SupabaseAuthGuard` (que es de controller, no global), así que
`request.userId` todavía no existe cuando el guard de rate limit se
ejecuta — no bastaba con leer un campo ya puesto por otro guard.

Límites configurados:

- **Default global** (`RateLimitModule`): 60 peticiones/min por usuario.
- `NavigationController`: 20/min — dinero real en Google Maps Platform.
- `AssistantController` (`POST /assistant/tools/:toolName/execute`): 20/min
  — ejecuta tools que pueden disparar acciones reales de dominio.
- `SimulationController`: 5/min — cómputo pesado (múltiples escrituras a
  Redis por corrida).
- `GET /health`: sin límite (`@SkipThrottle()`) — lo llaman monitores de
  infraestructura a intervalos cortos, no es una acción de negocio.
- `POST /system/queue/ping` (sin auth, endpoint interno de humo): queda con
  el default global (60/min, agrupado por IP al no tener token) — defensa
  mínima si se expusiera público por accidente, consistente con la nota ya
  existente en su propio archivo sobre necesitar un guard interno.

## Verificación real

- Simulación real contra un Redis local (`redis-server`, no mock) usando el
  paquete real `@nest-lab/throttler-storage-redis` (el mismo que corre en
  producción, no una reimplementación de prueba): 3/3 casos de storage —
  bloquea después de exceder el límite dentro de la ventana, una clave
  distinta (otro usuario) no se ve afectada por el consumo de la primera, y
  se desbloquea sola al vencer `blockDuration`.
- La función de decodificación de JWT (`decodeJwtSubUnsafe`, copiada exacta
  del archivo real para la prueba) probada con 4/4 casos: extrae `sub`
  correctamente de un JWT con la forma real de un token de Supabase,
  devuelve `null` ante un string que no es JWT, `null` si el payload no
  trae `sub`, y `null` con string vacío — nunca lanza una excepción no
  controlada que tumbaría el guard.
- `bun run typecheck` / `lint` / `build` — limpios (1 warning esperado y
  aceptado: `no-explicit-any` en la firma de `getTracker`, heredada de la
  librería — la clase base la declara así, no se puede evitar sin romper
  la compatibilidad de la sobrescritura).
- Pendiente, honesto: no se probó contra el backend arrancado de verdad
  (requiere `REDIS_URL`/`SUPABASE_SERVICE_ROLE_KEY` reales, que este
  entorno no puede recibir por chat) — queda para prueba manual del
  fundador con el backend corriendo, confirmando que un cliente real recibe
  `429 Too Many Requests` al exceder el límite.

## Fuera de alcance de este slice

- CAPTCHA o cualquier verificación humana — no pedido, sin evidencia de
  necesidad.
- Rate limiting del lado de `proyecto-mensajeria` (mensajería habla directo
  con Supabase, no pasa por este backend) — Supabase Auth/PostgREST tienen
  sus propios límites de plataforma, fuera del control de este código.
- Límites diferenciados por rol (ej. "ambulancia verificada" con límite más
  alto) — no pedido, se puede agregar después con evidencia real de
  necesidad.
- Alertas/dashboard de monitoreo de quién está siendo limitado — el
  storage en Redis es consultable manualmente si hace falta investigar un
  caso puntual, pero no hay UI para esto todavía.
