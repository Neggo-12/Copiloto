# ADR-0010 — Adapters de Routing y Geocoding (Fase 2, slice 2)

**Fecha:** 2026-08-19
**Estado:** Aceptado — código construido y verificado por typecheck/lint/build.
Verificación real contra la API de Google (con key real) queda pendiente de que
el fundador provisione `GOOGLE_MAPS_API_KEY`.

## Contexto

El documento de herramientas del proyecto
(`docs/operations/03_HERRAMIENTAS_URLS_Y_REFERENCIAS.md`, sección 2) define
Google Maps Platform como proveedor y pide cuatro adapters: `RoutingProvider`,
`GeocodingProvider`, `PlacesProvider`, `NavigationProvider`.

**Aclaración necesaria antes de construir (audita antes de adivinar):** revisando
la documentación oficial de Google, el "Navigation SDK" no es una API REST de
backend — es un SDK que corre embebido en la app Android/iOS del cliente
(`developers.google.com/maps/documentation/navigation/{android,ios}-sdk/overview`).
No existe un endpoint de backend al que este servicio pueda llamar para
"navegar". Construir un `NavigationProvider` de backend que llame a algo que no
existe habría sido simulación, exactamente lo que el fundador prohibió. La
responsabilidad real del backend en navegación es: calcular rutas y ETA
(`RoutingProvider`), y — en un slice futuro — detectar desvío de ruta
comparando la posición actual (ya disponible vía `LocationStateService`,
ADR-0009) contra la geometría de la ruta calculada. Esa lógica de desvío se
construye sobre `RoutingProvider`, no como un adapter nuevo separado.

## Decisión

**Este slice construye:** `RoutingProvider` (Google Routes API,
`computeRoutes`) y `GeocodingProvider` (Google Geocoding API, forward +
reverse). Ambos verificados contra la documentación oficial vigente el
2026-08-19 (no ejemplos viejos):
- https://developers.google.com/maps/documentation/routes/reference/rest/v2/TopLevel/computeRoutes
- https://developers.google.com/maps/documentation/geocoding/requests-geocoding

**Diferido a un slice posterior:** `PlacesProvider` (búsqueda de lugares) —
todavía no hay un caso de uso real que lo consuma (ni Modo Conducción ni
Emergency Corridor lo necesitan todavía); se construye cuando exista ese
consumidor, no antes ("no complejidad sin evidencia").

**Patrón de adapters (igual que Supabase/Redis):**
- `GoogleMapsModule` (`@Global()`): único lugar que conoce
  `GOOGLE_MAPS_API_KEY`. Los providers la reciben inyectada, nunca leen
  `process.env` directamente.
- `RoutingProvider`/`GeocodingProvider` son interfaces; `navigation.module.ts`
  es el único lugar que decide el binding concreto (`GoogleRoutingProvider`,
  `GoogleGeocodingProvider`). Cambiar de proveedor en el futuro (Mapbox, OSRM,
  HERE) es cambiar ese binding — cero cambios en `NavigationController` ni en
  cualquier consumidor futuro (Emergency Corridor necesitará `RoutingProvider`
  para el corredor dinámico).
- `GOOGLE_MAPS_API_KEY` es **opcional** en el arranque del backend (a
  diferencia de `REDIS_URL`, que ya es requerida) — mismo criterio que tuvo
  Redis antes de que Upstash quedara decidido. El fundador todavía no la ha
  creado. Sin la key, `/navigation/*` responde `503 Service Unavailable` con
  un mensaje claro; el resto del backend arranca y funciona normal. Se sube a
  variable requerida cuando la key esté configurada en producción.
- Endpoints (`POST /navigation/route`, `GET /navigation/geocode`,
  `GET /navigation/reverse-geocode`) protegidos con `SupabaseAuthGuard` —
  cada llamada tiene costo real en Google Maps Platform, nunca exponerlos sin
  autenticación.

## Verificación

- `typecheck`/`lint`/`build`: limpios (real, contra el código compilado).
- **Límite honesto de esta verificación:** no se hizo ninguna llamada real a
  Google Routes API ni Geocoding API todavía, porque este entorno no tiene
  (ni debe tener) una `GOOGLE_MAPS_API_KEY` — es una credencial que solo el
  fundador puede crear y pagar. El siguiente paso es que el fundador cree la
  key (pasos entregados en el chat) y la pegue en `backend/.env`; con eso
  puesto, la verificación real (llamada real a ambas APIs, con coordenadas
  reales) se hace contra su máquina — mismo patrón usado para verificar Redis
  contra la instancia real de Upstash en ADR-0008.

## Consecuencias

- `backend/src/modules/navigation/` es el único lugar donde vive lógica de
  routing/geocoding. Emergency Corridor (Fase 3) va a inyectar
  `RoutingProvider` desde aquí para calcular la geometría del corredor
  dinámico, no reimplementar llamadas a Google por su cuenta.
- Cada llamada a estos endpoints tiene costo real de Google Maps Platform
  (pricing por SKU/uso) — no diseñar el sistema asumiendo llamadas gratis
  ilimitadas, tal como advierte `03_HERRAMIENTAS_URLS_Y_REFERENCIAS.md` §18.
- `PlacesProvider` y la detección de desvío de ruta (route-deviation) quedan
  explícitamente pendientes, documentados como deuda intencional, no omisión.

## Referencias

- `docs/operations/03_HERRAMIENTAS_URLS_Y_REFERENCIAS.md` (sección 2)
- `docs/decisions/ADR-0009-location-engine.md`
- `backend/src/modules/navigation/`, `backend/src/common/google-maps/`
