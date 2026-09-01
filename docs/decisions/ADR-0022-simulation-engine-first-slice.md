# ADR-0022 — Motor de simulación (primer slice) + corrección de muestreo del corredor

**Fecha:** 2026-08-19
**Estado:** Aceptado — verificado con Redis real, 18/18 casos del escenario 1, más 4/4 de un fixture de severidad corregido.

## Contexto

Fase 4 del roadmap (Etapa 7, `04_ROADMAP_Y_ALCANCE.md`): "no lanzar a
usuarios antes de probar escenarios difíciles". De los 12 escenarios
mínimos listados, este es el primer slice — escenario 1, "una ambulancia /
10 vehículos" — siguiendo el mismo patrón incremental que el resto del
proyecto (un escenario a la vez, no los 12 de golpe sin evidencia de que el
motor mismo funciona).

## Decisión de diseño central

El motor **no reimplementa** la lógica de detección de conflictos — alimenta
posiciones sintéticas a los MISMOS servicios reales que usa producción
(`LocationStateService.setCurrent`, `RouteSessionService`,
`EmergencyCorridorService.findCandidates`,
`AlertPolicyService.evaluateAndDispatch/closeCorridor`). Si el Conflict
Engine real cambia mañana, el simulador prueba el código nuevo
automáticamente — no una copia que se puede desincronizar. Esto es lo que
hace que el simulador sirva de verdad, no un teatro aparte del sistema real
(coherente con "no quiero nada de simulación": lo sintético es el INPUT
—posiciones GPS de vehículos que no existen—, no el pipeline que las
procesa).

Piezas nuevas (`backend/src/modules/simulation/`):

- `SimulationEngineService.run(scenario)` — arranca una ruta real de
  ambulancia (`RouteSessionService.start`, con una polyline sintética
  codificada con el mismo formato que Google — ver `encodePolyline`,
  nueva en `common/geo/polyline.ts`, primer consumidor real), avanza N
  pasos moviendo cada vehículo virtual a velocidad constante sobre sus
  waypoints, y en cada paso corre el mismo camino que
  `GET /emergency/corridor/candidates` en producción. Cierra el corredor
  al final (`AlertPolicyService.closeCorridor`, ADR-0020).
- `common/geo/interpolate.ts` — `pointAtDistanceAlongPath` (interpola un
  punto a una distancia acumulada real sobre una ruta poligonal) y
  `pathLengthMeters`. Compartida por el motor (mover vehículos) Y por
  `EmergencyCorridorService.sampleAhead` (ver corrección abajo).
- `POST /simulation/scenarios/:name/run` — protegido por
  `SupabaseAuthGuard` (correr un escenario tiene costo real en Redis,
  aunque los "vehículos" sean sintéticos). Sin UI todavía — es una
  herramienta de verificación de ingeniería, mismo criterio que
  `GET /assistant/tools`.
- Escenario 1 (`scenarios/scenario-1-single-ambulance-10-vehicles.ts`):
  geometría 100% sintética determinista — 6 vehículos cerca de la ruta a
  distancias variadas (para cubrir critical/warning/info/fuera de buffer,
  algunos detectables solo cuando la ambulancia avanza) y 4 vehículos
  lejos, control negativo.

Métrica deliberadamente NO reportada todavía: "falsos positivos" /
"conflictos perdidos". Calcularlos de verdad requiere una noción de verdad
de terreno que este primer slice no modela — inventar un número aquí sería
simulación de la métrica, no de la ambulancia.

## Bug real encontrado por el simulador (y corregido)

Al construir el escenario 1, un vehículo colocado a mitad de la ruta (lejos
de ambos extremos) **nunca fue detectado**, aunque estaba claramente dentro
del buffer. Causa raíz en `EmergencyCorridorService.sampleAhead()`: muestreaba
cada N-ésimo PUNTO CRUDO del array decodificado (`SAMPLE_STRIDE = 5`), no
cada N metros reales. Con una polyline de Google real (docenas/cientos de
puntos por curvas y calles) esto funcionaba por casualidad — pero con una
ruta de pocos waypoints (como el fixture sintético de 2 puntos, o
potencialmente un tramo recto real con pocos puntos), el muestreo por
índice colapsaba a consultar solo 1-2 puntos (los waypoints originales),
dejando huecos reales del corredor sin cubrir.

**Corrección**: `sampleAhead` ahora calcula la distancia acumulada al
waypoint más cercano y muestrea hacia adelante por DISTANCIA real
(`pointAtDistanceAlongPath`, cada 100m, hasta 20 muestras = 2km de
corredor), sin importar cuántos waypoints traiga la polyline de entrada.
Efecto colateral honesto: esto también corrigió la SEMÁNTICA de
`distanceMeters`/`severity` de cada candidato — antes reflejaba, por
accidente, casi siempre "distancia al punto de origen/destino"; ahora
refleja correctamente "qué tan cerca está el candidato del punto más
próximo del CORREDOR real", que es lo que efectivamente importa para
decidir si un vehículo está en el camino de la ambulancia. El fixture de
verificación de ADR-0021 quedó desactualizado por este cambio — ver la nota
en ese ADR y la verificación corregida abajo.

Es exactamente el tipo de hallazgo que la Fase 4 del roadmap existe para
producir: un bug real en el Conflict Engine, encontrado por un escenario de
prueba antes de que un usuario real lo viviera.

## Verificación (real, sin mocks)

Smoke tests contra Redis real (`redis-server` local, limpiado al terminar),
`bun run` (nunca `bunx tsx`, mismo motivo documentado desde ADR-0018):

- **Escenario 1 completo, 18/18 casos**: los 8 pasos se ejecutan; los 6
  vehículos "cerca de la ruta" son alertados (incluyendo el que reveló el
  bug, ahora corregido); los 4 vehículos de control (lejos) NUNCA son
  alertados ni entran en cooldown; latencia real reportada (>0, coherente
  entre máximo y promedio); el corredor queda cerrado y el set de
  alertados vacío al terminar; **determinismo confirmado**: correr el
  mismo escenario dos veces produce exactamente el mismo patrón de
  candidatos detectados por paso.
- **Severidad con fixture corregido, 4/4 casos**: candidatos desplazados
  LATERALMENTE de la ruta (no sobre su línea, ver nota en ADR-0021) a
  30m/100m/200m/500m de distancia lateral — `critical`/`warning`/`info`/
  fuera de buffer, tal como especifica ADR-0021.
- `typecheck`/`lint`/`build` limpios en el backend completo (incluye el
  módulo de simulación y la corrección del Conflict Engine).

## Alcance fuera de este slice

- Escenarios 3–12 del roadmap (varias ambulancias simultáneas, vehículo
  fuera de ruta, GPS con ruido/atraso, desconexión, reconexión WebSocket,
  corredores cruzados, etc.) — se agregan uno a la vez, con evidencia de qué
  comportamiento real necesitan validar.
- Métricas de falsos positivos / conflictos perdidos (necesitan verdad de
  terreno explícita, no modelada todavía).
- UI de simulación en `proyecto-mensajeria` — sin consumidor real todavía.
- Vehículos en movimiento variable (aceleración, giros) — los escenarios 1
  y 2 usan velocidad constante sobre waypoints rectos.

## Escenario 2: "una ambulancia / 100 vehículos" (2026-09-01)

Segundo slice, Fase 4 recién desbloqueada (Fase 3 — Emergency Corridor —
cerrada el mismo día). A diferencia del escenario 1 (correctitud con una
mezcla chica y controlada), este valida **escala**: `LocationStateService.
findNearby` usa Redis GEOSEARCH por radio, no un escaneo de todos los
vehículos registrados — así que el costo real no depende del total de
vehículos en el sistema, depende de cuántos caen DENTRO del buffer en un
momento dado (cada candidato revalida su estado con un `GET` real a Redis).
Por eso el escenario no dispersa los 100 vehículos al azar: pone 70
realmente cerca del corredor, repartidos a lo largo de toda la ruta con la
mezcla completa de severidades (simulando un tramo con tráfico denso), y 30
lejos como control negativo — así la latencia reportada mide el caso que de
verdad importa.

Mismo largo de ruta/velocidad que el escenario 1 (2km a 54km/h) a
propósito, para poder comparar directamente.

**Verificación (real, sin mocks)**: `redis-server` local, clases reales
instanciadas a mano (mismas que usa producción vía Nest DI, sin
reimplementar nada — `LocationStateService`, `RouteSessionService`,
`EmergencyCorridorService`, `AlertPolicyService`, `SimulationEngineService`),
`bun run` (nunca `bunx tsx`). 8/8 casos:

- Ningún vehículo de control lejano (`sim100-far-*`) fue alertado en
  ningún paso.
- 53 de los 70 vehículos cercanos fueron alertados en algún momento
  (`uniqueVehiclesAlerted=53`) — el resto quedó fuera del buffer dinámico
  en todos los pasos, consistente con su posición.
- Aparecen las 3 severidades (`critical`/`warning`/`info`) en distintos
  pasos.
- Determinismo confirmado: dos corridas producen exactamente el mismo
  patrón de candidatos detectados por paso.
- Corredor cerrado y limpio al terminar (sin ambulancia activa residual,
  sin set de alertados, sin sesión de ruta).
- **Latencia real, escenario 1 vs. escenario 2** (10 → 100 vehículos, 10x
  más): `avgFindCandidatesLatencyMs` pasó de 3.22ms a 8.73ms (2.7x), muy
  por debajo de un escalado lineal ingenuo — confirma que GEOSEARCH por
  radio, no un escaneo total, es la decisión correcta para este volumen.
  Umbral de aceptación usado (generoso a propósito, este slice no es un
  benchmark fino): <500ms de promedio.

`typecheck`/`lint` del backend completo limpios (0 errores; el único
warning preexistente en `user-aware-throttler.guard.ts` no tiene relación
con este cambio).

## Referencias

- `docs/decisions/04_ROADMAP_Y_ALCANCE.md` (Etapa 7)
- `docs/decisions/ADR-0021-corridor-dynamic-buffer-severity.md` (nota de corrección agregada)
- `backend/src/modules/simulation/`, `backend/src/common/geo/interpolate.ts`, `backend/src/common/geo/polyline.ts` (`encodePolyline`)
- `backend/src/modules/simulation/scenarios/scenario-2-single-ambulance-100-vehicles.ts`
- `backend/src/modules/emergency-corridor/emergency-corridor.service.ts` (`sampleAhead` corregido)
- `backend/src/modules/location/location-state.service.ts` (`findNearby`, GEOSEARCH)
