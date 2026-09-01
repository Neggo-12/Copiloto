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

- Escenarios 5–12 del roadmap (GPS con ruido/atraso, desconexión,
  reconexión WebSocket, corredores que SÍ se cruzan geométricamente, etc.)
  — se agregan uno a la vez, con evidencia de qué comportamiento real
  necesitan validar.
- ~~Recálculo real de ruta cuando la ambulancia se desvía~~ — construido
  2026-09-01, ver sección "Recálculo real de ruta al detectar desvío" más
  abajo. El fundador decidió explícitamente construirlo (antes diferido a
  propósito por el costo real de la API).
- Métricas de falsos positivos / conflictos perdidos (necesitan verdad de
  terreno explícita, no modelada todavía).
- UI de simulación en `proyecto-mensajeria` — sin consumidor real todavía.
- Vehículos en movimiento variable (aceleración, giros) — los escenarios 1,
  2 y 3 usan velocidad constante sobre waypoints rectos.

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

## Escenario 3: "tres ambulancias simultáneas" (2026-09-01)

Tercer slice. A diferencia de los escenarios 1 (correctitud) y 2 (escala),
este valida **aislamiento**: tres corredores activos al mismo tiempo no
deben contaminarse entre sí en Redis. Rutas paralelas que NO se cruzan a
propósito — corredores que sí se cruzan geométricamente es un problema
distinto, reservado para el escenario 12.

**Pieza nueva**: `SimulationEngineService.runConcurrent(scenarios)` —
`Promise.all` real sobre el mismo `run()` de siempre, sin reimplementar
nada. Nuevo tipo `CompoundSimulationScenario` (una lista de escenarios de
una ambulancia) y un registro/endpoint separado en el controller
(`POST /simulation/compound-scenarios/:name/run`), mismo criterio de "uno a
la vez" que el registro de escenarios simples.

Geometría: tres carriles norte-sur paralelos (A en el origen, B a 500m al
este, C a 550m al este — deliberadamente cerca de B). Un candidato exclusivo
de A, un candidato COMPARTIDO a medio camino exacto entre B y C (25m de cada
carril, dentro del buffer crítico de ambas), y un control lejano.

**Verificación (real, sin mocks)**: mismas clases reales instanciadas a
mano, `redis-server` local, `bun run`. 10/10 casos:

- El candidato exclusivo de A solo aparece alertado por A — nunca por B ni C.
- El control lejano nunca se alerta en ninguna de las tres.
- El candidato compartido se alerta de forma **independiente** por B Y por
  C — confirma que `corridor:alert:<ambulanceId>:<candidateId>` está
  aislado por PAR (ambulancia, candidato), no se "gasta" en la primera que
  lo detecta.
- Al cerrar las tres, ninguna deja residuo en `corridor:active-ambulances`
  ni en su propio `corridor:alerted:<id>`.
- Determinismo confirmado en modo concurrente: correr las tres dos veces
  produce el mismo patrón de candidatos por paso, para cada una.

**Hallazgo honesto de la propia verificación**: la prueba original incluía
una afirmación de que correr en paralelo (`Promise.all`) sería más rápido
en reloj de pared que correr las tres una tras otra — resultó FALSO contra
Redis local (paralelo 82ms vs. secuencial 33ms). Causa real: con latencia
de red ~0 (Redis en `localhost`), el overhead de manejar 3 cadenas de
promesas a la vez pesa más que el ahorro de solaparlas; el beneficio real
de la concurrencia aparece con latencia de red real (Upstash en
producción, no en este sandbox). Se corrigió la prueba para no afirmar
algo que no es una garantía real del sistema — lo que sí importa
(aislamiento) se verificó y quedó documentado arriba, el timing queda solo
como dato informativo.

## Escenario 4: "vehículo fuera de ruta" (2026-09-01) — dos bugs reales encontrados y corregidos

Cuarto slice. Interpretado para el corredor (no navegación genérica): la
AMBULANCIA se desvía de su ruta planeada a mitad de trayecto (real:
tráfico, calle cerrada, decisión del conductor). Pregunta que responde:
cuando eso pasa, ¿el corredor sigue protegiendo por dónde va la ambulancia
DE VERDAD, o sigue "protegiendo" el camino abandonado?

**Pieza nueva**: `ambulancePlannedRoutePoints` opcional en
`SimulationScenario` — si difiere de `ambulance.routePoints`, el vehículo
se mueve por su posición GPS real pero el corredor registra la ruta
planeada distinta, igual que en producción real (`RouteSessionService`
nunca recalcula el polyline solo porque el GPS se alejó de él).

**Bug real #1 (arquitectónico, confirmado leyendo el código antes de
construir)**: `EmergencyCorridorService.findCandidates` siempre muestreaba
hacia adelante sobre la ruta PLANEADA original, sin importar cuánto se
hubiera desviado el GPS real — `location.gateway.ts` ya usa
`computeDeviation` para avisarle AL CONDUCTOR "te saliste de tu ruta", pero
nunca dispara nada hacia el corredor. Primera corrida real del escenario:
el vehículo cerca del camino ABANDONADO seguía recibiendo "protección"
(falsa alarma), y el vehículo cerca del camino REAL nunca fue alertado (el
peligro de verdad, sin aviso). **Corrección**: `findCandidates` ahora
detecta desvío real (mismo `computeDeviation`/60m que ya usa
`location.gateway.ts`) y cae a proteger el radio alrededor de la posición
ACTUAL en vez de seguir mirando hacia adelante sobre una ruta abandonada.
No es una solución completa — no recalcula una ruta nueva (eso es decisión
del fundador, implica llamar a Google Routes de nuevo con costo real) —
pero cierra el hueco de seguridad inmediato.

**Bug real #2 (encontrado verificando el fix del #1 — regresión real en
escenarios 1 y 2, no hipotética)**: al aplicar la corrección de arriba, los
escenarios 1 y 2 dejaron de detectar candidatos que antes sí detectaban
(escenario 1: 5→4 alertados únicos; escenario 2: 53→50). Causa raíz:
`computeDeviation` medía distancia al VÉRTICE más cercano de la ruta, no al
SEGMENTO — con una ruta de solo 2 puntos (inicio/fin, como estos
escenarios sintéticos, pero también cualquier tramo recto largo de una
ruta real de Google con pocos waypoints intermedios), a mitad de camino
ambos extremos quedan a ~1000m, muy por encima del umbral de 60m, así que
`computeDeviation` declaraba "fuera de ruta" incluso yendo perfectamente
sobre la línea. El comentario original de esa función YA marcaba la
proyección punto-segmento como mejora diferida "si la evidencia de uso
real muestra que hace falta, no se construye ahora sin esa evidencia" —
esta regresión real ES esa evidencia. **Corrección**: nueva
`distanceToPathMeters` en `common/geo/interpolate.ts` (proyección
punto-segmento real, no solo distancia a vértices), reemplaza el cálculo
interno de `computeDeviation`. Efecto colateral honesto: esto también
corrige el comportamiento real de producción en `location.gateway.ts` —
cualquier conductor en un tramo recto largo de una ruta real pudo haber
recibido avisos falsos de "te saliste de la ruta" antes de este fix.

**Verificación (real, sin mocks)**: `redis-server` local, `bun run`. 8/8
casos, incluyendo regresión completa de los escenarios 1, 2 y 3 (sin
cambios en sus resultados tras ambos fixes) más el escenario 4:

- Antes de la desviación: detección normal (control de cordura).
- Con el fix: el vehículo cerca del camino REAL (después de la desviación)
  SÍ es alertado.
- El control lejano nunca se alerta.
- Regresión: escenario 1 sigue con 5 alertados únicos, escenario 2 con 53,
  escenario 3 con el candidato compartido alertado por ambas ambulancias —
  idénticos a antes de los dos fixes.

`typecheck`/`lint` del backend completo limpios.

## Recálculo real de ruta al detectar desvío (2026-09-01)

El escenario 4 (arriba) cerró el hueco de seguridad inmediato con un
fallback (proteger el radio alrededor de la posición actual), pero dejó
documentado a propósito que NO recalculaba una ruta nueva — eso implica
llamar de nuevo a Google Routes API, con costo real, y quedaba como
decisión explícita del fundador. El fundador pidió construirlo hoy mismo
("hay que hacerlo").

**Qué cambió**: `EmergencyCorridorService.findCandidates` ahora, cuando
detecta desvío (`computeDeviation.offRoute`), intenta primero un recálculo
REAL contra `RoutingProvider` (el mismo `ROUTING_PROVIDER`/Google Routes
que ya usa `POST /navigation/route-session` — no se duplicó el binding, se
importó `NavigationModule` en `EmergencyCorridorModule`) desde la posición
actual de la ambulancia hasta su destino ORIGINAL (`activeRoute.destination`
no cambia — el conductor se desvía de CAMINO, no de A DÓNDE va). Si el
recálculo funciona, sobrescribe la ruta activa en `RouteSessionService` —
así la siguiente consulta del corredor Y el propio aviso "te saliste de tu
ruta" al conductor (`location.gateway.ts`, mismo `RouteSessionService`) ya
ven la ruta corregida, sin recalcular dos veces. Si falla (API caída, sin
`GOOGLE_MAPS_API_KEY`) o está en cooldown, cae al mismo fallback de radio
que ya existía — nunca rompe el corredor por un fallo externo.

**Cooldown real (`REROUTE_COOLDOWN_SECONDS = 30`)**: el cliente de la
ambulancia consulta el corredor cada 5-10s (ver doc de
`EmergencyCorridorController`); sin cooldown, cada consulta mientras el
desvío sigue activo dispararía una llamada real (con costo real) a Google
Routes. Mismo patrón `SET NX EX` que ya usa `AlertPolicyService` para el
cooldown de alertas — regla del propio proyecto: "no recalcular ni
notificar innecesariamente".

**Verificación (real, sin mocks, `redis-server` local)**: la única pieza
externa de pago real es `RoutingProvider` (Google Routes API cuesta dinero
real por llamada, ver doc de `NavigationController`) — se usó un
`RoutingProvider` FAKE y determinístico para probar el MECANISMO gratis
(igual que el resto de la infraestructura, siempre real: Redis,
`RouteSessionService`, `LocationStateService`, `EmergencyCorridorService`,
`AlertPolicyService`, todas las clases reales de producción). 15/15 casos:

- Desvío real → se llama al provider exactamente 1 vez, la sesión de ruta
  queda con un `encodedPolyline` distinto, el candidato cerca del camino
  REAL se detecta, el candidato cerca del camino abandonado no.
- El cooldown queda activo en Redis (TTL > 0) tras el recálculo.
- Segunda consulta inmediata (ya sobre la ruta corregida): no vuelve a
  llamar al provider.
- Nuevo desvío dentro de la ventana de cooldown: NO llama al provider de
  nuevo, cae correctamente al fallback de radio existente.
- Falla del provider (API caída, simulada): `findCandidates` no lanza
  excepción, cae al fallback, la ruta activa no se corrompe.
- Ambulancia que nunca se desvía: el provider de reroute nunca se invoca
  (cero llamadas de pago innecesarias).

Regresión completa (mismo `redis-server`, motor real `SimulationEngineService`):
escenario 1 sigue con 5 alertados únicos, escenario 2 con 53, escenario 3
con el candidato compartido alertado por ambas ambulancias — sin cambios,
confirmando que el corredor de reroute nunca se activa cuando no hace
falta. Escenario 4 re-corrido CON el recálculo real activo: el candidato
cerca del camino real sigue alertado, el control lejano nunca se alerta, y
desde que se detecta el desvío en adelante no hay alertas NUEVAS sobre el
camino abandonado (el candidato que sí se alerta cerca de ese camino lo
hace en el paso 1, ANTES de cualquier desvío — efecto del lookahead amplio
de `sampleAhead`/2km, no de la lógica de desvío; ver "Fuera de alcance"
abajo).

`typecheck`/`lint` del backend completo limpios.

**Prueba de humo real contra Google Routes**: no se hizo en este slice —
implica una llamada real con costo real. Queda disponible para cuando el
fundador quiera confirmarlo con una ambulancia/ruta real en el ambiente
de pruebas, con su confirmación explícita antes de disparar la llamada.

**Fuera de alcance de este cambio** (evidencia real encontrada hoy, no
hipotética, pero NO es parte de lo que se pidió construir):
`sampleAhead` sigue mirando hasta 2km hacia adelante desde el punto más
cercano de la ruta (`MAX_LOOKAHEAD_SAMPLES × SAMPLE_DISTANCE_METERS`),
sin importar cuánto falte de trayecto real. En una ruta sintética corta
(2km, 2 puntos) eso puede alertar de más a alguien cerca del FINAL de la
ruta planeada desde el primer paso (antes de que la ambulancia se acerque
o incluso se desvíe antes de llegar ahí) — y, en el caso simétrico
opuesto, una vez la posición actual queda más cerca del vértice FINAL que
del inicial, el ancla de muestreo salta a la distancia acumulada total
del vértice final en vez de a la proyección real de la posición actual
sobre el segmento, dejando huecos reales sin cubrir a mitad de tramo (la
misma familia de bug que ya se corrigió en `computeDeviation` —
vértice vs. segmento — pero no aplicada todavía a `sampleAhead`). En
producción esto se diluye mucho (una polyline real de Google tiene
decenas de waypoints, no 2), pero es un límite real, no solo del
simulador. No se corrige en este cambio (no era lo pedido y agregaría
alcance no solicitado) — queda anotado para si el fundador pide
priorizarlo con evidencia real de que hace falta.

## Referencias

- `docs/decisions/04_ROADMAP_Y_ALCANCE.md` (Etapa 7)
- `docs/decisions/ADR-0021-corridor-dynamic-buffer-severity.md` (nota de corrección agregada)
- `backend/src/modules/simulation/`, `backend/src/common/geo/interpolate.ts`, `backend/src/common/geo/polyline.ts` (`encodePolyline`)
- `backend/src/modules/simulation/scenarios/scenario-2-single-ambulance-100-vehicles.ts`
- `backend/src/modules/simulation/scenarios/scenario-3-three-ambulances-simultaneous.ts`
- `backend/src/modules/simulation/scenarios/scenario-4-vehicle-off-route.ts`
- `backend/src/modules/emergency-corridor/emergency-corridor.service.ts` (`sampleAhead` corregido, fallback real por desvío, y ahora `tryReroute` — recálculo real contra Google Routes)
- `backend/src/modules/emergency-corridor/emergency-corridor.module.ts` (importa `NavigationModule` por `ROUTING_PROVIDER`)
- `backend/src/modules/route-session/route-deviation.ts` (`computeDeviation` corregido a distancia real de segmento)
- `backend/src/modules/navigation/providers/routing-provider.interface.ts`, `google-routing.provider.ts` (`RoutingProvider` real, ya existente desde ADR-0010, reusado — no duplicado)
- `backend/src/modules/location/location-state.service.ts` (`findNearby`, GEOSEARCH)
