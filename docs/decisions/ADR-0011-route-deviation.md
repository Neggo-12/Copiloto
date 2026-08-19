# ADR-0011 — Sesión de ruta activa y detección de desvío (Fase 2, slice 3)

**Fecha:** 2026-08-19
**Estado:** Aceptado — verificado con datos reales (no simulados) contra la
polyline que devolvió Google en la prueba del fundador (ADR-0010) y contra
Redis real local.

## Contexto

De las dos piezas que quedaban pendientes de Fase 2 (`PlacesProvider` y
detección de desvío de ruta), esta es la que da más valor ahora mismo: es
matemáticamente el mismo problema central del **Conflict Engine** de
Emergency Corridor (Fase 3) — "¿qué tan cerca está un punto de una geometría
de ruta?" — descrito en `mobility-emergency.md` como parte del pipeline
`ruta → segmentos → buffer dinámico → conductores candidatos → detección de
conflicto`. Construir esto ahora deja esa pieza matemática ya probada contra
datos reales, en vez de reconstruirla desde cero cuando llegue Emergency
Corridor. `PlacesProvider` sigue sin tener consumidor real — se mantiene
diferido.

## Decisión

**`RouteSessionService`** (nuevo módulo `route-session/`, Redis, TTL 4h): la
ruta activa que un usuario está siguiendo ahora mismo — origen, destino,
polyline codificada, distancia/duración. Un usuario tiene como máximo una
ruta activa a la vez (sin caso de uso real todavía para múltiples rutas
simultáneas). No es `@Global()` — se importa explícitamente donde se
necesita (`LocationModule`, `NavigationModule`), a diferencia de la
infraestructura transversal real (Supabase/Redis/Queue).

**`POST /navigation/route-session`**: arranca una ruta. El origen **no** se
recibe del cliente — se toma de `LocationStateService` (la última ubicación
real conocida, Location Engine ADR-0009). Esto evita confiar en un origen que
el cliente podría inventar, y conecta explícitamente dos piezas que hasta
ahora vivían separadas (Location Engine y Routing).

**Detección de desvío (`route-deviation.ts`)**: en cada `location:update` por
WebSocket, si el usuario tiene una ruta activa, `LocationGateway` decodifica
la polyline (`decodePolyline`, algoritmo estándar de Google, implementado
directo sin dependencia nueva) y calcula la distancia real (Haversine) al
punto más cercano de la ruta. Umbral: 60m (cubre precisión GPS urbana +
espaciado normal entre puntos del polyline). Decisión explícita: es distancia
al vértice más cercano, no proyección punto-segmento — el polyline de Google
viene densamente muestreado, así que esta aproximación ya es útil en la
práctica; la versión más precisa (y más costosa) queda como refinamiento
futuro si la evidencia de uso real lo pide.

**Diferido a propósito, documentado como deuda intencional, no omisión:**
recompute automático de ruta cuando el usuario se desvía. Detectar el desvío
ya es información útil por sí sola (se devuelve en cada ack de
`location:update`: `{ onRoute, distanceFromRouteMeters }`); decidir cuándo
recalcular automáticamente (cooldown, UX de "ruta recalculada") es una
decisión de producto que no está definida todavía y que implica una llamada
de pago adicional a Google en cada recálculo — no se construye sin esa
definición ("no complejidad sin evidencia").

**Refactor de paso, sin cambiar comportamiento:** `haversineMeters` y
`LatLng` estaban duplicados/acoplados dentro de `location-normalizer.ts` y
`routing-provider.interface.ts` respectivamente. Se centralizaron en
`common/geo/` porque ahora `route-deviation.ts` también los necesita — evita
tener dos implementaciones del mismo cálculo de distancia real divergiendo
con el tiempo.

## Verificación (real, sin mocks)

- `typecheck`/`lint`/`build`: limpios.
- **`decodePolyline` + `computeDeviation` contra datos reales:** se
  reutilizó la polyline exacta que devolvió Google Routes API en la prueba
  real del fundador contra su key de producción (ADR-0010, ruta Parque
  Berrío → El Poblado). 6/6 casos pasaron: el primer punto decodificado cae
  a 46.7m del origen real y el último a 20.9m del destino real (dentro del
  margen esperado de una polyline simplificada); un punto tomado de la ruta
  real da `offRoute: false`; un punto desplazado ~2km da `offRoute: true`
  (2231.7m); una ruta vacía fuerza `offRoute: true`.
- **`RouteSessionService` contra Redis real** (instancia local, no mock):
  4/4 casos — sin sesión inicial, guardar y recuperar con round-trip
  correcto, `clear()` borra la sesión, usuario sin sesión devuelve `null`.
- **Límite honesto:** no se probó `POST /navigation/route-session` de punta
  a punta a través del HTTP real (requeriría un JWT real de usuario, mismo
  límite ya documentado en ADR-0009) ni el flujo completo WebSocket +
  desvío en vivo. La lógica de negocio (decodificación, cálculo de
  distancia, persistencia) sí está probada con datos reales; falta la
  integración end-to-end con un cliente real, que es el mismo paso pendiente
  documentado desde el Location Engine.

## Consecuencias

- `route-session/` es la pieza matemática reusable que Emergency Corridor
  (Fase 3) va a necesitar para "conductor candidato dentro del corredor" —
  se construye sobre la misma base (`computeDeviation` contra una geometría),
  no una implementación nueva.
- `common/geo/` pasa a ser el lugar único para utilidades geográficas
  (`LatLng`, `haversineMeters`, `decodePolyline`) — cualquier módulo nuevo
  que necesite geometría real importa de ahí, no reimplementa.
- El ack de `location:update` ahora puede incluir `route: { onRoute,
  distanceFromRouteMeters }` — los clientes que quieran mostrar "te saliste
  de la ruta" ya tienen el dato, sin necesitar un endpoint nuevo.

## Referencias

- `docs/decisions/ADR-0009-location-engine.md`, `ADR-0010-navigation-google-maps.md`
- `backend/src/modules/route-session/`, `backend/src/common/geo/`
