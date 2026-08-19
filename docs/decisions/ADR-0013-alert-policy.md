# ADR-0013 — Alert Policy: dedup, cooldown y push por WebSocket (Fase 3, slice 2)

**Fecha:** 2026-08-19
**Estado:** Aceptado — verificado con Redis real (dedup/cooldown) y con un
servidor/cliente Socket.IO reales (entrega real por WebSocket, no simulada).

## Contexto

Segunda rebanada de Emergency Corridor: convertir "candidatos detectados"
(ADR-0012) en alertas reales entregadas a esos candidatos, sin repetir el
mismo aviso cada pocos segundos mientras siguen en el buffer.

## Decisión

**Dedup + cooldown atómico en Redis (`SET NX EX`, 30s):** por cada par
(ambulancia, candidato), una sola llamada atómica decide si corresponde
alertar ahora o si ya se alertó recientemente — sin condición de carrera
entre evaluaciones concurrentes. Cuando el cooldown expira, si el candidato
sigue en conflicto, se alerta de nuevo; si ya no aparece en
`findCandidates()`, simplemente no se le vuelve a avisar. Esto cubre
"expiración" sin necesitar un mecanismo aparte.

**Entrega por el mismo canal WebSocket que ya existe (`/location`), no un
canal nuevo:** cada socket autenticado se une a una "room" de Socket.IO con
su propio `userId` (`LocationGateway.handleConnection`). Un nuevo
`LocationBroadcastService` guarda la referencia real al servidor Socket.IO
(vía `OnGatewayInit`) y expone `notify(userId, event, payload)` — así
`AlertPolicyService` (en el módulo de Emergency Corridor) puede empujar
eventos a un usuario específico sin conocer Socket.IO ni el gateway
directamente. Desacopla "quién decide alertar" de "cómo se entrega".

**Disparo actual: pull, no push automático.** El cliente de la ambulancia
llama `GET /emergency/corridor/candidates` periódicamente (5-10s sugerido)
mientras el traslado está activo; cada llamada evalúa candidatos Y despacha
alertas en el mismo paso. Se decidió así — y no disparar la evaluación en
cada `location:update` de cualquier usuario — porque eso obligaría a
consultar `emergency_vehicles` en Supabase en cada reporte de ubicación de
TODOS los usuarios (no solo ambulancias), un costo real por gente que nunca
va a ser ambulancia. El polling de la propia ambulancia es más barato y
suficiente para este slice.

**Diferido a propósito, no fingido:** diferenciar mensaje/canal por tipo de
vehículo del candidato (visual+audio para carro, voz prioritaria para moto,
de la visión completa del fundador). Hoy no existe ningún dato de "en qué
vehículo va este usuario" — nadie lo pide ni lo guarda todavía en ningún
punto del sistema. Enviar el mismo mensaje base a todos por ahora es
honesto; inventar la diferenciación sin el dato real habría sido
simulación. Queda documentado como decisión de producto pendiente (ver nota
sobre permisos/ubicación continua más abajo).

## Verificación (real, sin mocks)

- `typecheck`/`lint`/`build`: limpios.
- **Dedup/cooldown contra Redis real** (5/5 casos): primera evaluación alerta
  a ambos candidatos; segunda evaluación inmediata con los mismos candidatos
  los deja en cooldown (0 alertados, 2 en cooldown); un candidato nuevo que
  aparece mientras los otros siguen en cooldown SÍ se alerta.
- **Entrega real por WebSocket** (3/3 casos), con un servidor y un cliente
  de Socket.IO reales (no NestJS booteado — el broadcast primitivo aislado,
  honesto sobre qué se probó): `notify()` sin clientes conectados no lanza
  excepción; un cliente real conectado y unido a su room recibe el evento
  `corridor:alert` real por la red (loopback), con el mensaje base exacto y
  la distancia; un segundo cliente con otro `userId` NO recibe un evento
  dirigido al primero (aislamiento por room confirmado).
- **Límite honesto:** lo probado es el mecanismo de entrega (Socket.IO
  room-based emit) de forma aislada, no el flujo completo autenticado
  (`handleConnection` con un JWT real → `join()` → alerta real disparada
  desde `GET /emergency/corridor/candidates`) — mismo límite ya documentado
  desde ADR-0009 (requeriría credenciales que este entorno no maneja).

## Sobre ubicación continua y permisos (pregunta del fundador)

El fundador señaló correctamente un riesgo: si los candidatos no están
reportando ubicación constantemente, el propósito del corredor no se cumple
— una ambulancia podría pasar sin que nadie sea detectado. **La respuesta no
es relajar el filtro de "stale"** (eso haría que el sistema alertara o
dejara de alertar basado en posiciones viejas y potencialmente incorrectas —
más peligroso, no menos). La respuesta real es que la app cliente (todavía
sin construir) debe:

1. Pedir permiso de ubicación (mínimo "mientras se usa la app"; "siempre" si
   el fundador decide que se necesita tracking en segundo plano) como parte
   del onboarding — decisión de producto pendiente, no técnica.
2. Reportar ubicación de forma continua por el WebSocket de `/location`
   mientras la app está abierta y en uso — no solo durante navegación
   activa, sino también mientras el usuario está en mensajería, dejando un
   recordatorio, o hablando con el asistente. El backend ya soporta esto sin
   cambios: `location:update` no depende de tener una ruta activa.
3. Reportar con una cadencia que mantenga la posición "fresca" — la ventana
   de `stale` es 30s (`LocationStateService`), así que un reporte cada
   ~15-20s mientras la app está activa es razonable (balance con batería).

Esto queda registrado como decisión de producto abierta en
`docs/architecture/MISSING_CAPABILITIES.md` (sección "Producto / Decisiones
abiertas") — es trabajo de la futura app cliente, no de este backend, que ya
está preparado para recibirlo.

## Referencias

- `docs/decisions/ADR-0009-location-engine.md`, `ADR-0012-emergency-corridor-candidates.md`
- `backend/src/modules/emergency-corridor/alert-policy.service.ts`
- `backend/src/modules/location/location-broadcast.service.ts`
