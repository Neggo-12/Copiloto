# ADR-0012 — Emergency Corridor: candidatos cerca del corredor (Fase 3, slice 1)

**Fecha:** 2026-08-19
**Estado:** Aceptado — verificado con datos reales (Redis GEO real + la
polyline real de Google usada en ADR-0010/0011). Falta integración end-to-end
con clientes reales (mismo límite honesto que el resto del backend).

## Contexto

Primera rebanada de Emergency Corridor (Fase 3 del cronograma). Se priorizó
sobre `PlacesProvider` porque reutiliza directamente lo construido en Fase 2
(Location Engine, Routing, detección de desvío) y es la base matemática real
del Conflict Engine descrito en `mobility-emergency.md`
(`ruta → segmentos → buffer dinámico → conductores candidatos → detección de
conflicto → alert policy`). Este slice cubre hasta "conductores candidatos";
Alert Policy (notificaciones, dedup, cooldown, voz para motos) queda para la
siguiente rebanada, una vez esto esté probado con datos reales.

## Decisión

**El corredor ES la ruta activa de la ambulancia — no se duplica esa
noción.** Un conductor de ambulancia arranca su traslado con el mismo
`POST /navigation/route-session` que cualquier usuario (ADR-0011). No existe
un endpoint separado "arrancar corredor": hubiera sido reconstruir algo que
ya existe, violando REUSE > EXTEND > REFACTOR > REPLACE.

**Índice geoespacial en Redis (`LocationStateService` extendido, no un
servicio nuevo):** cada `setCurrent()` ahora también hace `GEOADD` a un
único sorted set (`location:geo`). Nuevo método `findNearby(punto, radio)`
usa `GEOSEARCH` (Redis 6.2+, disponible en Upstash — confirmado real en
ADR-0008). Elegido sobre PostGIS a propósito: es posición "caliente" de
segundos, no histórico — mismo principio que ya rige el resto del Location
Engine (Redis = estado efímero, Postgres = verdad persistente).

**Limitación real de Redis manejada explícitamente:** los miembros de un GEO
set no expiran individualmente (a diferencia de `location:current:<userId>`,
que sí tiene TTL de 300s). Un usuario que dejó de reportar ubicación
seguiría apareciendo en el índice GEO indefinidamente. Mitigación: cada
candidato que devuelve `findNearby()` se revalida contra su
`location:current:<userId>` real antes de incluirse — si no existe o está
`stale`, se descarta. Verificado explícitamente con un caso de prueba (ver
Verificación).

**`EmergencyCorridorService.findCandidates(ambulanceDriverId)`:**
1. Lee la ruta activa de la ambulancia (`RouteSessionService`, ya existe).
2. Encuentra el punto de la ruta más cercano a la posición actual de la
   ambulancia (mismo cálculo que `route-deviation.ts`).
3. Muestrea puntos hacia adelante desde ahí (cada 5 puntos del polyline
   decodificado, tope de 20 muestras — cada muestra es una llamada real a
   Redis, así que se limita el costo).
4. Por cada muestra, `findNearby()` con buffer fijo de 200m (el buffer
   "dinámico" por velocidad, de la visión completa del fundador, queda
   diferido — sin evidencia todavía de que el fijo no alcance).
5. Devuelve la lista deduplicada de candidatos con su distancia mínima al
   corredor, todos en estado `potential_conflict` (único estado de este
   slice — `NO_CONFLICT` es implícito por ausencia; `ACTIVE_CONFLICT` y
   `PASSED` necesitan contexto que no existe todavía: velocidad relativa,
   si el candidato ya cedió el paso).

**`GET /emergency/corridor/candidates`:** protegido con `SupabaseAuthGuard`
**y** una verificación adicional — solo conductores con
`emergency_vehicles.verified = true` y `active = true` (ADR-0006) pueden
consultar. "Qué usuarios están cerca de mí" es información sensible de
terceros; nunca se expone a cualquier usuario autenticado, por regla de
seguridad explícita del proyecto.

## Verificación (real, sin mocks)

- `typecheck`/`lint`/`build`: limpios.
- **7/7 casos reales** contra Redis local real (GEO real, no mock) y la
  polyline real que devolvió Google en la prueba del fundador (ADR-0010):
  sin ruta activa devuelve `null`; con ruta activa no es `null`; un
  candidato ubicado exactamente sobre un punto real de la ruta SÍ aparece
  (39m de distancia); un candidato a ~2km NO aparece; **un candidato
  presente en el índice GEO pero sin `location:current` real (simulando el
  caso "dejó de reportar hace rato") NO aparece** — prueba directa de la
  mitigación documentada arriba; la ambulancia no se cuenta a sí misma;
  el estado devuelto es `potential_conflict`.
- **Límite honesto:** no se probó el endpoint HTTP de punta a punta con un
  JWT real de usuario ni con un `emergency_vehicles.verified/active = true`
  real (requeriría credenciales que este entorno no maneja) — mismo límite
  ya documentado desde ADR-0009. La lógica de negocio completa (geoespacial,
  desvío, autorización de ambulancia) sí está probada con datos reales.

## Consecuencias

- Emergency Corridor pasa de "solo autorización de quién es ambulancia"
  (ADR-0006) a tener su primera pieza de detección real.
- Siguiente rebanada natural: Alert Policy (notificar a los candidatos, con
  dedup/cooldown/expiración, mensaje base "Ambulancia aproximándose. Facilite
  el paso cuando sea seguro hacerlo.", diferenciado carro vs. moto) — no se
  construye todavía porque depende de decidir el mecanismo de entrega (push,
  WebSocket, voz) y no hay evidencia de cuál usar primero sin probar esto.
- El buffer fijo de 200m y el muestreo de hasta 20 puntos son valores
  iniciales razonables, no calibrados con tráfico real — ajustar cuando haya
  evidencia de un piloto real.

## Sobre ubicación en tiempo real en el chat (pregunta del fundador)

Se evaluó hacerlo en la misma rebanada y se decidió diferirlo, no porque sea
inviable, sino porque es un dominio distinto (mensajería, vive en
`proyecto-mensajeria/`, no en este backend) con su propio alcance (mostrar
un pin de ubicación en un chat, quién puede verla, cuánto dura compartida).
Construirlo ahora habría diluido esta rebanada de Emergency Corridor, que es
la función que motivó todo este trabajo. Ventaja real de dejarlo para
después: cuando se construya, reutiliza exactamente esta misma
infraestructura (`LocationGateway`, `LocationStateService`) — no es trabajo
perdido, es la secuencia más eficiente.

## Referencias

- `docs/decisions/ADR-0006-emergency-corridor.md`, `ADR-0009-location-engine.md`,
  `ADR-0010-navigation-google-maps.md`, `ADR-0011-route-deviation.md`
- `backend/src/modules/emergency-corridor/`
- `.claude/skills/puntos-movilidad-engineering/references/mobility-emergency.md`
