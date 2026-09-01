# ADR-0020 — Cierre de corredor de emergencia (`POST /emergency/corridor/close`)

**Fecha:** 2026-08-19
**Estado:** Aceptado — verificado con Redis real (11/11 casos).

## Contexto

Del alcance original de la Fase 3 (Emergency Corridor, `04_ROADMAP_Y_ALCANCE.md`)
seguían pendientes, a propósito: buffer dinámico por velocidad, estados
`ACTIVE_CONFLICT`/`PASSED`, severidad `INFO`/`WARNING`/`CRITICAL`, y cierre
de corredor (`completed`/`cancelled`/`expired`). De esos cuatro, el cierre
es el que tiene una brecha de producto real y ya observable: hoy, si una
ambulancia deja de alertar (llega a su destino o cancela el traslado), los
candidatos que alcanzó a alertar nunca reciben un "ya pasó, gracias" — solo
dejan de recibir alertas nuevas, lo cual no es lo mismo que un cierre
explícito. Los otros tres (buffer dinámico, estados intermedios, severidad)
requieren decisiones de producto que el fundador no ha dado todavía (¿qué
velocidad ensancha cuánto el buffer?, ¿qué umbral separa `WARNING` de
`CRITICAL`?) — implementarlos con números inventados sería adivinar, así
que siguen diferidos.

## Decisión

Nuevo endpoint `POST /emergency/corridor/close` (mismo guard que
`GET /emergency/corridor/candidates`: solo ambulancia verificada+activa),
body `{ reason?: "completed" | "cancelled" }` (por defecto `"cancelled"` si
no se manda — más seguro asumir que no se completó que lo contrario sin
confirmación explícita).

Se reutiliza el mismo mecanismo del corredor en vez de crear estado nuevo:

- El corredor sigue siendo la ruta activa (`RouteSessionService`, ADR-0011)
  — cerrar limpia esa misma sesión (`routeSession.clear()`), no se duplica
  la noción de "corredor activo".
- Se agregó un set de Redis nuevo, `corridor:alerted:{ambulanceDriverId}`
  (`AlertPolicyService`), que acumula a TODOS los candidatos alertados
  durante el traslado activo — distinto del cooldown por par ya existente
  (`corridor:alert:{ambulancia}:{candidato}`, 30s), que solo evita spam
  repetido y no sirve para saber a quién avisar al cerrar. TTL espejo de
  `RouteSessionService` (4h): el set no debe sobrevivir más que la ruta que
  lo originó.
- Al cerrar, se lee y limpia ese set, y se manda `corridor:closed` (mismo
  WebSocket `/location`, mismo `LocationBroadcastService` de ADR-0013) a
  cada candidato que fue alertado, con `{ ambulanceDriverId, reason }`.

**`expired` no tiene código propio a propósito**: si nadie llama a `close`,
el TTL de la ruta (4h) y el TTL espejo del set de alertados vencen solos.
Es una limitación honesta y documentada, no un descuido: no hay todavía un
job de barrido que notifique "conflicto resuelto" cuando expira sin cierre
explícito — construirlo ahora, sin evidencia de que 4h de espera silenciosa
sea un problema real, sería complejidad sin evidencia (regla del proyecto).

## Verificación (real, Redis local, sin mocks)

Smoke test contra un Redis real (`redis-server` local, puerto temporal,
proceso limpiado al terminar) arrancando el `AppModule` completo con
`bun run` (nunca `bunx tsx`, por el problema de metadata de decoradores ya
documentado en ADR-0018) — 11/11 casos:

- Arranque completo del `AppModule` con `RouteSessionService` inyectado en
  `EmergencyCorridorController` (grafo de DI sin ciclos).
- Primer `evaluateAndDispatch` alerta a los 2 candidatos y los dos quedan en
  el set `corridor:alerted:` con TTL puesto.
- Segundo `evaluateAndDispatch` inmediato: ambos caen en cooldown (30s),
  cero alertas repetidas — confirma que el cambio no rompió el
  comportamiento ya existente de ADR-0013.
- `closeCorridor` devuelve exactamente los 2 candidatos alertados y limpia
  el set.
- Cerrar un corredor ya cerrado devuelve `[]` sin lanzar error (caso de
  doble tap en la futura UI).
- `routeSession.clear()` sobre un usuario sin ruta activa no lanza error
  (mismo camino que toma el controller).

`typecheck`/`lint`/`build` limpios sobre el backend completo.

## Alcance fuera de este slice (documentado, no resuelto)

- Buffer dinámico por velocidad de la ambulancia — **cerrado**, ver ADR-0021.
- Severidad `INFO`/`WARNING`/`CRITICAL` — **cerrado**, ver ADR-0021.
- Estados `ACTIVE_CONFLICT`/`PASSED` (hoy solo existe `potential_conflict`) —
  sigue diferido a propósito: necesitan contexto que todavía no existe
  (velocidad relativa candidato/ambulancia, historial de trayectoria para
  saber si ya cedió el paso) — construirlos con datos inventados sería
  adivinar, no una decisión de producto tomada.

## Cierre real 2026-09-01: `expired` + UI de ambulancia

Los dos gaps que quedaban de este ADR (barrido de expiración silenciosa y
cliente que llame a `close`) se cerraron a pedido explícito del fundador
("termina con el corredor de emergencia la ambulancia") — antes diferidos
por regla de "no complejidad sin evidencia", ahora con evidencia real de
que hacían falta.

**Barrido de expiración** (`AlertPolicyService.sweepExpired`,
`CorridorExpirySweepProcessor`, cola `EMERGENCY_ALERTS` — reservada desde
ADR-0008, sin processor hasta hoy): nuevo set `corridor:active-ambulances`
en Redis, sin TTL propio (lista de membresía, no dato caliente) — se agrega
en cada `evaluateAndDispatch` real (solo se llama con ruta activa
confirmada) y se quita en `closeCorridor` sin importar el motivo. Un job
repetible (BullMQ, `jobId` fijo para que un restart del backend no duplique
el barrido, cada 15 minutos — de sobra frente al TTL de 4h que detecta)
revisa ese set: si `RouteSessionService.getActive()` ya no devuelve nada
para una ambulancia, su corredor quedó "colgado" (app cerrada, viaje
abandonado, batería agotada) sin que nadie llamara a `/close` — se cierra
solo, con `reason: "expired"` (nuevo valor de `CorridorCloseReason`),
avisando `corridor:closed` real a quien alcanzó a alertarse.

**Cliente real**: `EmergenciaScreen.tsx` ahora tiene botones "Llegué /
Finalizar" y "Cancelar traslado" para el conductor de ambulancia (llaman a
`POST /emergency/corridor/close` vía el nuevo `closeAmbulanceCorridor` en
`useCopilotoRealtime`, antes sin ningún caller en el frontend) — y el lado
del posible afectado ahora escucha `corridor:closed` real y muestra "Ya
pasó, gracias por facilitar el paso."

Verificado real (Redis local real, mismo método que ADR-0008/0012/0013/
0020 original — no mock): 9/9 casos — dos ambulancias activas se marcan
correctas; el barrido detecta solo a la que expiró (ruta ya no existe) y
deja intacta a la que sigue con ruta real; el set de alertados de la
expirada se limpia igual que un cierre explícito; un segundo barrido
inmediato no vuelve a "expirar" a la misma; el cierre explícito normal
(`completed`) sigue funcionando exactamente igual que antes (no se rompió
nada existente), incluyendo que cerrar dos veces no lanza error.
`typecheck`/`lint`/`build` reales quedan pendientes de correr en la
máquina del fundador (mismo límite de siempre de este entorno).

**Todavía sin resolver, a propósito, gap real encontrado en la misma
auditoría**: hoy no existe ningún flujo en la app para que un administrador
verifique/asigne qué vehículo es ambulancia — `emergency_vehicles.verified`
(ADR-0006) solo se puede escribir por SQL/MCP directo contra Supabase, no
hay endpoint ni pantalla de administrador. Para el volumen del piloto
controlado (Fase 8, 5-10 ambulancias) esto es operable así; construir un
panel de administrador es una decisión de alcance aparte, no tomada aquí.

## Referencias

- `docs/decisions/ADR-0012-emergency-corridor-candidates.md`, `ADR-0013-alert-policy.md`, `ADR-0017-alert-channel-differentiation.md`
- `backend/src/modules/emergency-corridor/{alert-policy.service.ts,emergency-corridor.controller.ts,emergency-corridor.types.ts}`
