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

**Confirmación empírica adicional (2026-09-02, construyendo el Escenario
6)**: el caso simétrico opuesto de este mismo límite se reprodujo en la
práctica, no solo en teoría — una ruta sintética de 2 puntos con la
posición actual casi exactamente equidistante de ambos extremos hace que
`sampleAhead` ancle al vértice más lejano por un empate de punto flotante
en la comparación de distancias, saltando el muestreo hacia adelante
directo al final de la ruta y perdiéndose cualquier candidato de en medio.
Encontrado diseñando el script de verificación del Escenario 6 (no en
producción) — se corrigió el DISEÑO del script (posición de prueba
alejada del punto medio), no `sampleAhead` — sigue siendo el mismo límite
ya documentado arriba, fuera de alcance.

## Escenario 5: "GPS con ruido" (2026-09-02)

Quinto slice. Auditado antes de construir: `SimulationEngineService` NUNCA
pasa por `validateRawReport`/`normalizeReport` (`location-normalizer.ts`) —
escribe directo a `LocationStateService.setCurrent()`. Ese es el mecanismo
REAL de defensa contra GPS con ruido del proyecto, y no tenía ninguna
verificación (no hay `*.spec.ts` en el repo — este proyecto verifica con
escenarios reales, no con un framework de tests). Por eso este slice tiene
dos partes.

**Parte A — verificación directa de `validateRawReport`/`normalizeReport`**
(`verify-gps-noise.ts`, script real no comiteado, mismo criterio que el
resto de las verificaciones de esta ADR): 13/13 casos, con las funciones
reales, sin mocks — ruido urbano realista (±15m, accuracy 12m) aceptado con
calidad `good`; accuracy degradada (120m) aceptada pero marcada
`low_accuracy`; un glitch real (salto de 2km en 1s) RECHAZADO con
`implausible_jump`, confirmando además que un reporte rechazado nunca
contamina la siguiente validación (`LocationGateway` solo llama a
`locationState.setCurrent()` cuando `validation.ok`, así que el `previous`
de la siguiente validación sigue siendo el último reporte BUENO); accuracy
imposible (8000m) y velocidad imposible (400km/h) rechazadas duro; reloj
del cliente muy adelantado rechazado. Ningún bug encontrado — el mecanismo
ya existente funciona como se esperaba, primera vez que se confirma con
evidencia real en vez de solo por lectura de código.

**Parte B — estabilidad del corredor bajo ruido aceptado**
(`scenario-5-gps-noise.ts`): la ambulancia se mueve por una ruta recta real
(temporización correcta), pero lo que reporta al corredor tiene ruido
determinístico (`sin()`, nunca `Math.random()`) encima — ±15m en la mayor
parte del trayecto, con una zona adversarial de ±65m (a caballo del umbral
de 60m) simulando una mala zona de señal.

**Pieza nueva, encontrada construyendo, no anticipada**:
`ambulanceReportNoise` en `SimulationScenario`. La primera versión de este
escenario metía el ruido directo en `ambulance.routePoints` (un zigzag
real) — eso distorsionaba el LARGO real del recorrido (el arco de un
zigzag es más largo que la línea recta) y por lo tanto el tiempo real de
viaje: el "temblor" adversarial nunca coincidía con el paso simulado
esperado porque el vehículo tardaba más de lo calculado en recorrerlo.
Corregido desacoplando el ruido de sensor (lo que se REPORTA) del
movimiento físico real (por dónde y a qué velocidad se mueve de verdad) —
`SimulationEngineService.run()` ahora calcula la posición verdadera primero
(temporización siempre correcta) y, si el escenario define
`ambulanceReportNoise`, la transforma antes de guardarla en
`LocationStateService`. Sin este campo (escenarios 1-4), el comportamiento
es idéntico a antes.

**Verificación (real, sin mocks, `redis-server` local)**: 4/4 casos —
candidato estable (sin ruido propio) detectado igual que en escenarios
anteriores; control lejano nunca alertado; candidato con temblor propio a
caballo del umbral crítico (67.5m con buffer=270m) sí alertado; el
recálculo real de ruta (`tryReroute`, con el mismo provider fake
determinístico de siempre) se disparó exactamente 1 vez — en el único paso
simulado (1200m recorridos) que cae dentro de la zona adversarial — y
ningún paso con ruido normal lo disparó. Regresión completa de los
escenarios 1-4 sin cambios (5, 53, aislamiento por par, escenario 4 con el
recálculo activo) — confirma que agregar `ambulanceReportNoise` como campo
opcional no afectó a los escenarios que no lo usan.

`typecheck`/`lint`/`build` del backend completo limpios.

## Escenario 6: "GPS atrasado" (2026-09-02)

Sexto slice. Igual que el Escenario 5, tiene dos partes reales — pero a
diferencia de todos los anteriores, ninguna de las dos necesitó un
`scenario-6-*.ts` nuevo registrado en el motor: el simulador escribe una
posición fresca en CADA paso para CADA vehículo (nunca "envejece" un
reporte a propósito), así que no hay forma de ejercitar "atraso" real a
través de él sin inventar una capacidad nueva en el motor sin evidencia de
que haga falta (regla del proyecto). Las dos preguntas reales de este
escenario se verifican completas con llamadas directas a las funciones/
servicios reales — mismo criterio que la Parte A del Escenario 5.

**Parte A — bug real encontrado y corregido en `validateRawReport`**
(`verify-gps-delayed.ts`, script real no comiteado): un reporte ATRASADO
que llega con `clientTimestamp` igual o ANTERIOR al último ya guardado
(reintento de red, reordenamiento de paquetes, cola offline que se vacía
al reconectar en distinto orden) se rechazaba antes con el motivo
EQUIVOCADO (`implausible_jump`, como si fuera un salto físico imposible).
Causa raíz: el cálculo de velocidad implícita forzaba `deltaSeconds` a un
mínimo de 0.001s vía `Math.max(...)` para evitar dividir por cero o un
número negativo — pero eso hace que CUALQUIER distancia no-cero entre las
dos posiciones produzca una velocidad absurda, así que el reporte
terminaba rechazado igual (correcto), solo que con el motivo incorrecto
(problema real para debugging/observabilidad, no un hueco de seguridad).
Corregido agregando un chequeo explícito: `clientTimestamp <=
previous.clientTimestamp` se rechaza de una vez con el motivo real,
`out_of_order` (nuevo valor en `LocationRejectionReason`), antes de
calcular velocidad implícita — aceptar ese reporte de todas formas estaría
mal igual (haría retroceder en el tiempo la posición "actual" guardada),
así que el rechazo en sí no cambia, solo el motivo. Efecto colateral
correcto: un reporte DUPLICADO exacto (mismo `clientTimestamp`, reintento
del cliente) también se rechaza como `out_of_order` — evita reescribir y
re-emitir de más por un no-op, regla del proyecto "no notificar
innecesariamente".

Verificado, 9/9 casos, con la función real, sin mocks: primer reporte sin
`previous` (base); reporte nuevo con velocidad físicamente plausible
(base, sin cambios); reporte atrasado → `out_of_order` (el bug corregido);
duplicado exacto → `out_of_order`; una RÁFAGA de reportes atrasados en la
ENTREGA pero en orden entre sí (cola offline que se vacía junta) — deben
aceptarse todos, porque atraso de entrega no es lo mismo que fuera de
orden; y un reordenamiento real DENTRO de esa misma ráfaga → el reporte
fuera de orden se rechaza igual, aunque sea parte de un lote "atrasado".

**Parte B — gap real encontrado y corregido (visibilidad, no
comportamiento) en `EmergencyCorridorService.findCandidates`**
(`verify-corridor-stale.ts`, Redis real, sin simulador): auditando el
código se encontró una asimetría real. `LocationStateService.findNearby`
YA excluye candidatos con posición atrasada (`current.stale`, más de
`STALE_AFTER_MS`=30s sin reporte nuevo) — pero `findCandidates` nunca
revisaba el `stale` de la posición de la AMBULANCIA misma: si el GPS del
conductor de la ambulancia se atrasa (túnel, celular en segundo plano,
zona sin señal), el corredor seguía usando en silencio la última posición
conocida, sin ninguna señal de que estaba desactualizada. Se decidió NO
inventar comportamiento nuevo sin evidencia de qué debería hacer distinto
(¿dejar de alertar? ¿ensanchar el buffer? — ninguna de las dos tiene
pedido ni evidencia real todavía) — se agregó únicamente una advertencia
real en logs (mismo patrón ya usado en `location.gateway.ts` para "te
saliste de tu ruta"), citando el mismo `STALE_AFTER_MS` real (exportado
de `LocationStateService`, no duplicado) en vez de dejarlo pasar en
silencio. El corredor sigue degradando de la misma forma que antes (usa
la última posición conocida, no falla) — lo único nuevo es que ahora
queda evidencia real de cuándo pasa.

Verificado, 7/7 casos, contra Redis real: ambulancia con posición fresca
→ sin advertencia; ambulancia con posición atrasada (>30s) → sigue
funcionando, CON advertencia real en logs; candidato cercano con posición
fresca → sí aparece (caso base); candidato cercano con posición atrasada
→ NO aparece (confirma de punta a punta, por primera vez con evidencia
real, un mecanismo que ya existía pero que ningún escenario anterior
había ejercitado — los escenarios 1-5 nunca dejan envejecer un reporte);
el `RoutingProvider` real (Google Routes) nunca se llamó, como se
esperaba (la ambulancia de este script nunca se desvía de su ruta).

Regresión completa de los Escenarios 1-5 sin cambios (5 alertados únicos,
53 alertados únicos, aislamiento por par entre corredores concurrentes,
Escenario 4 con detección + recálculo real activo, Escenario 5 corre sin
error) — confirma que ninguno de los dos cambios de este slice (el nuevo
motivo `out_of_order`, el log de posición atrasada) afecta a nada que no
sea el camino de GPS atrasado — esperado, porque el simulador nunca pasa
por `validateRawReport` y el log nuevo no cambia el valor que devuelve
`findCandidates`.

`typecheck`/`lint`/`build` del backend completo limpios.

## Escenario 7: "usuario sin conexión" (2026-09-02)

Séptimo slice. Igual que el Escenario 6, sin `scenario-7-*.ts` nuevo
registrado en el motor — "desconexión" es la misma clase de problema que
"atraso" desde la perspectiva del sistema (ausencia de reportes en el
tiempo), y el simulador nunca deja de reportar del todo para ningún
vehículo. Verificado completo con `verify-user-offline.ts` (script real no
comiteado, Redis real, sin simulador). Auditado antes de construir:
`LocationGateway` NO implementa `OnGatewayDisconnect` (a diferencia de
`AssistantVoiceGateway`, que sí) — no hay ningún código que reaccione AL
INSTANTE a una desconexión de socket. Dos partes, ninguna encontró un bug
— la primera vez en esta serie de escenarios que el resultado es "confirma
que ya funciona bien", no "encontró y corrigió algo".

**Parte A — candidato se desconecta a mitad del corredor**: confirma que
la exclusión por posición atrasada (`LocationStateService.findNearby`, ya
verificada en el Escenario 6) es suficiente por sí sola — un candidato que
deja de reportar del todo tiene exactamente el mismo efecto, desde el
punto de vista del corredor, que uno "atrasado para siempre": después de
`STALE_AFTER_MS` (30s) deja de aparecer como candidato, sin necesitar
ningún manejo especial de desconexión. También confirma que notificar a
alguien desconectado (`corridor:closed` al cerrar el corredor) no lanza ni
rompe nada — `Socket.IO` simplemente no tiene a quién entregarle el
evento a esa room, es un no-op seguro por diseño.

**Parte B — la ambulancia se desconecta a mitad de un traslado**: primera
verificación real de `AlertPolicyService.sweepExpired()`/
`CorridorExpirySweepProcessor` (el barrido periódico cada 15 min,
ADR-0020) — nunca se había ejercitado con evidencia real, solo existía por
lectura de código. Confirma con evidencia real, no corrige, la brecha ya
documentada en ADR-0020: el disparador del barrido es el TTL de la SESIÓN
DE RUTA (4h), completamente independiente de si la ambulancia sigue
reportando posición. Si la ambulancia se desconecta, su posición queda
"atrasada" en 30s (mismo mecanismo del Escenario 6), pero el corredor
sigue "activo" para el barrido — y por lo tanto sigue alertando
candidatos nuevos que entren en rango — hasta que la sesión de ruta misma
cumpla su TTL de 4 horas. Recién ahí `sweepExpired` cierra el corredor y
notifica "ya pasó" a quien se había alertado. Sigue siendo una decisión
deliberada del fundador ("diferido a propósito hasta tener evidencia real
de que hacía falta cerrarlo antes") — esta es esa evidencia, con números
concretos, no un hallazgo nuevo que obligue a actuar ahora.

Verificado, 12/12 casos: candidato conectado detectado y alertado (base);
candidato desconectado ya no aparece; cerrar el corredor con un candidato
desconectado no lanza y sí lo intenta notificar; ambulancia desconectada
con sesión de ruta aún vigente → el barrido NO cierra el corredor todavía;
sesión de ruta expirada (simulada con `routeSession.clear()`, equivalente
real a que el TTL de Redis se cumpla) → el barrido SÍ cierra y notifica;
barrido con cero corredores activos no lanza. Sin cambios de código en
este slice — solo evidencia real de un comportamiento que ya era correcto.
`typecheck`/`lint`/`build` del backend completo limpios (sin cambios que
verificar, se confirmó que seguían limpios).

## Escenario 8: "reconexión WebSocket" (2026-09-02)

Octavo slice, contraparte natural del Escenario 7. Sin `scenario-8-*.ts`
nuevo en el motor (mismo motivo que 6 y 7). Verificado con
`verify-reconnect.ts` (script real no comiteado, Redis real). Auditado
antes de construir: `LocationGateway` no tiene ningún código especial de
"reconexión" — cada conexión nueva de Socket.IO simplemente vuelve a
autenticar y unirse a su room en `handleConnection`, sin estado pegado al
socket anterior (confirmado en el Escenario 7). Lo real que hacía falta
verificar era el resto del sistema: validación, corredor y cooldown de
alertas cuando los reportes se reanudan. Como el Escenario 7, ningún caso
encontró un bug — confirma con evidencia real que el diseño ya existente
se comporta bien.

**Hallazgo de diseño confirmado, no un bug**: hay DOS TTL reales distintos
en juego que nunca se habían comparado con evidencia real. `STALE_AFTER_MS`
(30s, ya conocido desde el Escenario 6) solo marca `stale: true` — la
clave de Redis sigue viva. `REDIS_KEY_TTL_SECONDS` (300s = 5 min, interno
de `location-state.service.ts`) es el TTL real de la clave
`location:current:<userId>` — pasado ese tiempo la clave desaparece del
todo y `getCurrent()` devuelve `null`, no solo `stale: true`. Esto importa
para `validateRawReport`: reconectar dentro de la ventana 30s-300s todavía
compara contra un `previous` real (chequeo de velocidad implícita
aplica); reconectar después de 300s llega con `previous: null` — se trata
como un reporte de cero, igual que un usuario nuevo cualquiera.

**Parte A (ventana 30s-300s)**: candidato alertado → se desconecta → deja
de aparecer (confirma Escenario 6/7 sigue vigente) → se reconecta desde
una posición nueva pero físicamente alcanzable en el tiempo REAL
transcurrido — `validateRawReport` lo acepta (no confunde "estuvo
desconectado" con "salto imposible", porque el `deltaSeconds` real usado
es el tiempo real transcurrido, no la ventana simulada) → vuelve a
aparecer en el corredor de inmediato → si el cooldown de alerta por par ya
venció, se puede volver a alertar (la reconexión no lo bloquea para
siempre).

**Parte B (después de 300s, clave de Redis vencida del todo)**: confirma
que `getCurrent()` devuelve `null` (no solo `stale: true`) — probado
borrando la clave directamente, efecto real observable idéntico a que el
TTL real se cumpla — y que el siguiente reporte, con `previous: null`, se
acepta como reporte de cero sin chequeo de velocidad implícita contra
nada, reapareciendo en el corredor como cualquier candidato nuevo.

**Parte C (la ambulancia se reconecta, continuación real del Escenario
7)**: confirma que la advertencia real de "GPS atrasado" (agregada en el
Escenario 6) no es un estado "pegado" — se re-evalúa en cada llamada real
a `findCandidates`, así que desaparece sola en cuanto la ambulancia vuelve
a reportar, sin necesitar limpieza explícita.

Verificado, 11/11 casos, Redis real. Sin cambios de código — solo
evidencia real de un comportamiento que ya era correcto, como el
Escenario 7. `typecheck`/`lint`/`build` del backend completo limpios (sin
cambios que verificar, se confirmó que seguían limpios).

## Escenario 9: "ambulancia cancelada" (2026-09-02)

Noveno slice. Sin `scenario-9-*.ts` nuevo en el motor — auditado antes de
construir: `AlertPolicyService.closeCorridor` no tiene ninguna rama de
código distinta según el motivo (`completed`/`cancelled`/`expired` solo
cambian la etiqueta que recibe el candidato notificado), así que agregar
un campo nuevo al motor de simulación solo para elegir el motivo habría
sido complejidad sin evidencia real de que aporte algo que las llamadas
directas no cubran ya — mismo criterio que Escenarios 6-8. Verificado con
`verify-cancel.ts` (script real no comiteado, Redis real).

**Parte A — ciclo de vida real de `POST /emergency/corridor/close`**
(default `reason: "cancelled"` si no se manda, ver el controller):
cancelar un corredor que nunca tuvo candidatos ni se registró como activo
(nunca se llamó `GET /candidates`) no lanza, no hay a quién notificar —
`SREM` sobre un set del que nunca fue miembro es un no-op seguro,
confirmado con Redis real. Cancelar un corredor CON un candidato ya
alertado sí lo notifica, y con el motivo REAL (`"cancelled"`, no
`"completed"` por defecto) — la etiqueta se propaga tal cual, nunca se
pierde. Tras cancelar, la ruta activa desaparece y `findCandidates` vuelve
a devolver `null` (mismo estado que "nunca arrancó nada"). Doble
cancelación (botón "Cancelar" tocado dos veces, o un reintento de red) es
idempotente: la segunda llamada no lanza y no reenvía la notificación —
confirma la regla del proyecto "no notificar innecesariamente" también en
este camino, nunca antes verificada con evidencia real.

**Parte B — aislamiento real entre ambulancias**: cancelar el corredor
propio nunca toca el de otra ambulancia — ruta activa, candidatos y
notificaciones de la otra quedan intactos. Nota honesta sobre cómo se
construyó esta prueba: la primera versión del script reusaba las mismas
coordenadas para dos ambulancias "distintas" y falló — no porque el
producto tuviera un bug, sino porque con corredores geográficamente
superpuestos, el corredor de una SÍ empieza a ver a la otra ambulancia (y
a candidatos ya alertados por ella) como candidatos nuevos propios. Eso es
real, pero es la pregunta del Escenario 12 ("corredores que sí se
cruzan", todavía pendiente en el roadmap) — se corrigió el diseño de ESTA
prueba (coordenadas bien separadas) para no mezclar las dos preguntas, y
se deja anotado como evidencia útil para cuando se construya el Escenario
12, no como algo a corregir ahora.

**Parte C (hallazgo real, documentado, NO corregido)**: cancelar no limpia
el cooldown real de recálculo de ruta (`corridor:reroute-cooldown:
<ambulanceDriverId>`, `tryReroute`, ADR-0022) — confirmado con Redis real,
el cooldown sigue existiendo después de cancelar. Impacto real acotado: si
el MISMO conductor cancela y arranca un traslado nuevo dentro de los 30s
siguientes, y ese traslado nuevo necesita un recálculo real de ruta de
inmediato, caería al fallback existente (proteger el radio alrededor de
la posición actual) en vez de recalcular contra Google Routes — sigue
siendo seguro, solo menos preciso (mismo criterio que la documentación
original de `tryReroute`). No se corrige: la clave está scopeada al
CONDUCTOR, no a un traslado en particular, y limpiarla al cancelar
agregaría una dependencia cruzada entre `AlertPolicyService` y
`EmergencyCorridorService` para un caso de borde de baja probabilidad y
bajo impacto — se documenta como evidencia real por si el fundador pide
priorizarlo.

Verificado, 16/16 casos, Redis real. Sin cambios de código — el ciclo de
vida de cancelación ya funcionaba bien, incluida la idempotencia.
`typecheck`/`lint`/`build` del backend completo limpios (sin cambios que
verificar, se confirmó que seguían limpios).

## Escenario 10: "ambulancia terminada" (2026-09-02)

Décimo slice. Auditado antes de construir: `CorridorCloseReason`
(`completed`/`cancelled`/`expired`) no tiene NINGUNA rama de lógica
distinta según el motivo en ningún lugar del código (confirmado con
`grep` real) — solo es la etiqueta que recibe el candidato notificado, y
el ciclo de vida completo (cierre, liberación de ruta, idempotencia,
aislamiento entre ambulancias) ya se verificó a fondo en el Escenario 9.
Lo real que faltaba, y lo que este slice cubre, es el CONTROLLER mismo:
todos los scripts de verificación anteriores (6-9) llamaban directo a
`AlertPolicyService`/`EmergencyCorridorService`, nunca al
`EmergencyCorridorController` que de verdad recibe `POST
/emergency/corridor/close` — primera vez que se instancia y se prueba el
controller real, no solo los servicios de abajo. Único fake de este
script: `EmergencyVehiclesService` (usa Supabase real, sin credenciales
disponibles en este sandbox — mismo criterio que fakear el
`RoutingProvider` real, infraestructura externa fuera de alcance, no
lógica propia); todo lo demás (Redis, `RouteSessionService`,
`AlertPolicyService`, `EmergencyCorridorService`) es real.

**Bug real encontrado y corregido**: auditando `close()` se encontró que
cualquier valor de `reason` no reconocido (un typo real del cliente, ej.
`"finished"` en vez de `"completed"`, o incluso `"expired"` — motivo
interno que solo debería producir el barrido real,
`AlertPolicyService.sweepExpired`, nunca un cliente) caía CALLADO al
default `"cancelled"`, notificando a los candidatos con la etiqueta
equivocada ("se canceló" en vez de "ya pasó") sin que nadie se enterara
del error real del cliente. Corregido: se agregó `CLIENT_CLOSE_REASONS =
["completed", "cancelled"]` (deliberadamente sin `"expired"`) y el
endpoint ahora rechaza con `BadRequestException` (400) cualquier `reason`
no vacío que no sea uno de esos dos — `reason` omitido sigue
defaulteando a `"cancelled"` exactamente como antes (comportamiento
deliberado ya documentado: "más seguro asumir que no llegó a
completarse"), eso no cambió.

Verificado, 10/10 casos, con el controller real, Redis real: `reason:
"completed"` (botón real "Finalizar") cierra, libera la ruta y notifica
con la etiqueta real; `reason` omitido sigue en `"cancelled"` por
defecto; un `reason` inválido (typo del cliente) se rechaza con 400 y sin
efectos secundarios (la ruta activa queda intacta); `reason: "expired"`
mandado explícitamente por un cliente también se rechaza; un conductor no
verificado/activo no puede cerrar ningún corredor (guardia de
autorización ya existente, primera vez verificada a través del
controller real). `typecheck`/`lint`/`build` del backend completo
limpios.

## Escenario 11: "conductor entra/sale del corredor" (2026-09-02)

Décimo primer slice. Ninguna de las capas involucradas (`LocationStateService.findNearby`,
`EmergencyCorridorService.findCandidates`, `AlertPolicyService.evaluateAndDispatch`)
guarda memoria de posiciones pasadas — cada consulta es un `GEOSEARCH` real
sobre la posición ACTUAL (confirmado leyendo `location-state.service.ts`), así
que "entrar/salir del corredor" en sí mismo ya funciona por construcción: un
candidato que sale del buffer geográfico simplemente deja de aparecer en la
próxima consulta, sin necesitar ningún manejo especial. Lo real que faltaba
verificar con evidencia (nunca ejercitado en los Escenarios 6-10, que solo
mueven candidatos una vez) es cómo se comporta el dedup/cooldown de 30s
(`AlertPolicyService`, `alertStateKey`) a través de MÚLTIPLES transiciones
entrada→salida→reentrada del mismo candidato durante el mismo traslado.

**Sin bugs encontrados** — el mecanismo ya existente se comporta correctamente
en cada transición real, verificado con Redis real, 17/17 casos: candidato
fuera del buffer no se alerta ni aparece en ningún resultado; al entrar por
primera vez se alerta y queda en el set de "alertados del traslado"
(`corridor:alerted:<id>`); al salir del buffer sigue en ese set (así puede
recibir el aviso real de "ya pasó" si el corredor cierra mientras está
afuera — confirmado en el caso G); al reentrar DENTRO de los 30s de cooldown
no se genera una alerta nueva (`skippedByCooldown`, sin notificación
duplicada); al reentrar DESPUÉS de que el cooldown expira de verdad
(simulado borrando la clave, mismo patrón que Escenarios 6-8) sí se genera
una alerta nueva legítima, y el set de alertados no duplica al candidato
(`SADD` es idempotente); cerrar el corredor mientras el candidato está
afuera del buffer en ese instante igual lo notifica con el motivo real y
vacía el set; sin ruta activa tras cerrar, `findCandidates` vuelve a
devolver `null` sin romper nada. Sin cambios de código —
`typecheck`/`lint`/`build` del backend completo limpios (sin cambios que
verificar, se confirmó que seguían limpios).

## Escenario 12: "dos corredores se cruzan" (2026-09-02)

Décimo segundo y último slice del roadmap mínimo de simulación. Motivado
por evidencia real, no hipotética: durante el Escenario 9, la primera
versión de la prueba de aislamiento entre ambulancias reusó las mismas
coordenadas para "dos ambulancias distintas" y el corredor de una SÍ trató
a la otra ambulancia como un candidato civil más — se corrigió el diseño
de esa prueba en su momento (separando coordenadas), pero quedó anotado
como evidencia real para este escenario, con la pregunta correcta: ¿qué
pasa cuando dos corredores de ambulancias real y geográficamente se
cruzan, no por un descuido de prueba?

**Bug real encontrado y corregido**: `LocationStateService.findNearby`
indexa a TODOS los usuarios que reportan ubicación por igual (conductores
de ambulancia incluidos, reportan por el mismo `location.gateway.ts` que
cualquier candidato civil) — y `EmergencyCorridorService.findCandidates`
solo excluía de sus resultados a la propia ambulancia consultante
(`candidate.userId === ambulanceDriverId`), nunca a OTRAS ambulancias con
corredor activo. Con dos rutas que se cruzan de verdad, una ambulancia
podía aparecer como "candidato civil" en el corredor de la otra —
recibiendo (o generando) el mensaje real "Ambulancia aproximándose,
facilite el paso", pensado para un conductor civil, no para otra
ambulancia en traslado. Corregido reusando `ACTIVE_AMBULANCES_KEY` (el
mismo set real que ya mantiene `AlertPolicyService` para `sweepExpired`,
exportado — no un mecanismo nuevo ni una copia): `findCandidates` ahora
excluye de sus resultados a cualquier `userId` que esté en ese set,
además de a sí misma. Ambas ambulancias ya quedan registradas ahí desde
su primer poll real (`GET /emergency/corridor/candidates` llama
`findCandidates` + `evaluateAndDispatch` juntos, cada 5-10s), así que en
uso real esta exclusión aplica desde el segundo poll de cada ambulancia
en adelante — una ventana de carrera mínima y de bajísima probabilidad en
el primerísimo poll de dos ambulancias que arrancan su corredor
simultáneamente, documentada aquí, no cerrada por no haber evidencia de
que haga falta.

Verificado con Redis real, 18/18 casos, con dos rutas rectas que se
cruzan de verdad (no coordenadas idénticas, evidencia real de un cruce
geográfico): con las ambulancias lejos entre sí, ninguna detecta a la
otra (caso base); moviendo a la ambulancia B directo sobre la ruta de la
ambulancia A, A ya NO la trata como candidato civil (antes del fix, esta
misma prueba falla — confirmado revirtiendo el fix temporalmente y
reproduciendo la falla real antes de restaurarlo, evidencia de que la
prueba de verdad cubre el bug); simétrico para B con A sobre su ruta; un
candidato CIVIL real parado justo en el punto de cruce sí es detectado
por AMBAS ambulancias y alertado de forma independiente por cada una (2
notificaciones reales distintas, una con cada `ambulanceDriverId`, sin
que el cooldown de una bloquee a la otra — el filtro nuevo solo excluye
ambulancias, nunca candidatos civiles); cerrar el corredor de una
ambulancia no toca el set de alertados ni el cooldown real de la otra
(aislamiento bajo cruce geográfico genuino, no solo bajo coordenadas
separadas a propósito como en el Escenario 9); sin ruta activa tras
cerrar/limpiar ambas, `findCandidates` vuelve a `null`. Regresión
puntual del caso base de un solo corredor (sin otras ambulancias
activas): candidato dentro del buffer se sigue detectando y alertando
exactamente igual que antes del cambio. `typecheck`/`lint`/`build` del
backend completo limpios.

Con este escenario se completan los 12 escenarios mínimos del roadmap
(Etapa 7). Quedan pendientes, fuera de alcance de "escenarios mínimos":
las métricas de latencia/falsos positivos/conflictos perdidos (roadmap,
aún no específicas de ningún escenario) y los hallazgos ya documentados
y deliberadamente no corregidos (`sampleAhead` con lookahead fijo de
2km; el cooldown de recálculo de ruta no se limpia al cancelar,
Escenario 9) — ninguno bloqueante, todos con evidencia real y
justificación de por qué no se corrigieron todavía.

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
- `backend/src/modules/simulation/scenarios/scenario-5-gps-noise.ts`, `backend/src/modules/simulation/simulation.types.ts` (`ambulanceReportNoise`)
- `backend/src/modules/location/location-normalizer.ts` (`validateRawReport`/`normalizeReport` — mecanismo real de defensa contra GPS con ruido; motivo `out_of_order` agregado en Escenario 6)
- `backend/src/modules/location/location-state.service.ts` (`findNearby`, GEOSEARCH; `STALE_AFTER_MS` exportado en Escenario 6)
- `backend/src/modules/location/location.types.ts` (`LocationRejectionReason` — `out_of_order` agregado)
- `backend/src/modules/emergency-corridor/{alert-policy.service.ts,corridor-expiry-sweep.processor.ts}`, `backend/src/common/queue/queue-names.ts` (`sweepExpired`/barrido real, verificado con evidencia en Escenario 7)
- `docs/decisions/ADR-0020-emergency-corridor-closure.md` (brecha del barrido vs. TTL de ruta, confirmada con evidencia real en Escenario 7, sin corregir — decisión deliberada del fundador)
- `backend/src/modules/emergency-corridor/emergency-corridor.controller.ts` (validación real de `reason` agregada en Escenario 10 — primera vez que un escenario prueba el controller, no solo los servicios)
- `backend/src/modules/emergency-corridor/emergency-corridor.service.ts` (`findCandidates` ahora excluye a otras ambulancias con corredor activo, Escenario 12), `backend/src/modules/emergency-corridor/alert-policy.service.ts` (`ACTIVE_AMBULANCES_KEY` exportada para ese fix, mismo set real ya usado por `sweepExpired`)
