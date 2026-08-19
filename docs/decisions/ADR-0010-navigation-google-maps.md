# ADR-0010 — Adapters de Routing y Geocoding (Fase 2, slice 2)

**Fecha:** 2026-08-19
**Estado:** Aceptado y verificado de punta a punta contra la API real de
Google (key de producción del fundador, restringida por IP + por API).

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
- **Actualizado 2026-08-19:** el fundador creó la API key en Google Cloud
  Console (proyecto `copiloto-506002`), habilitó Routes API y Geocoding API,
  configuró facturación por pago por uso (sin plan de suscripción — decisión
  explícita para no sobredimensionar en esta etapa), y restringió la key por
  IP (dirección de su conexión, IPv4 + IPv6 en notación `/128`) y por API
  (solo Routes API + Geocoding API). Con la key puesta en `backend/.env`
  (verificada de forma enmascarada: 39 caracteres, prefijo `AIzaSy...`, sin
  ver el valor completo), se hicieron dos llamadas reales, no simuladas,
  desde la máquina del fundador contra la API real de Google:
  - **Geocoding API:** `address=Parque Berrio Medellin` → `status: OK`,
    coordenadas correctas (`6.2500271, -75.5681333`), dirección formateada
    correcta.
  - **Routes API (`computeRoutes`):** ruta real Parque Berrío → El Poblado
    (Medellín) → `distanceMeters: 7287`, `duration: 1083s` (~18 min),
    polyline codificada devuelta correctamente.
  Ambas respuestas son datos reales de Google, no mockeados — mismo estándar
  de verificación usado para Redis/Upstash en ADR-0008.

## Consecuencias

- `backend/src/modules/navigation/` es el único lugar donde vive lógica de
  routing/geocoding. Emergency Corridor (Fase 3) va a inyectar
  `RoutingProvider` desde aquí para calcular la geometría del corredor
  dinámico, no reimplementar llamadas a Google por su cuenta.
- Cada llamada a estos endpoints tiene costo real de Google Maps Platform
  (pricing por SKU/uso) — no diseñar el sistema asumiendo llamadas gratis
  ilimitadas, tal como advierte `03_HERRAMIENTAS_URLS_Y_REFERENCIAS.md` §18.
  Con pago por uso, las primeras 10.000 llamadas mensuales por API (Routes y
  Geocoding, cada una por separado) no tienen costo — más que suficiente para
  el piloto de 50-100 usuarios.
- `PlacesProvider` y la detección de desvío de ruta (route-deviation) quedan
  explícitamente pendientes, documentados como deuda intencional, no omisión.
- La restricción por IP de la key hay que revisarla si la IP del fundador
  cambia (algunos ISP la rotan) o cuando el backend se despliegue a un
  servidor de producción con IP fija distinta — hoy apunta a la conexión de
  desarrollo local del fundador.

## Referencias

- `docs/operations/03_HERRAMIENTAS_URLS_Y_REFERENCIAS.md` (sección 2)
- `docs/decisions/ADR-0009-location-engine.md`
- `backend/src/modules/navigation/`, `backend/src/common/google-maps/`
