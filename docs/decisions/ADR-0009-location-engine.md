# ADR-0009 — Location Engine (Fase 2, slice 1)

**Fecha:** 2026-08-19
**Estado:** Aceptado — primer slice de Fase 2 (Location & Navigation). Los adapters
de Google Maps (routing/geocoding/places/ETA/desvío de ruta) quedan para el
siguiente slice, porque requieren una API key que el fundador debe provisionar.

## Contexto

El fundador fue explícito: no reducir Fase 2 a "activar GPS + conectar Google
Maps", pensar la arquitectura para que sea sólida desde ahora (funcionar con
50-100 usuarios) sin sobredimensionar, y no avanzar sin verificación real. Este
ADR cubre el primer slice vertical: el motor que recibe, valida, normaliza y
mantiene el estado de ubicación — el cimiento del que dependen routing, ETA,
geofencing (recordatorios) y el tracking del Emergency Corridor.

## Decisión

**Ingesta:** WebSocket dedicado (`LocationGateway`, namespace `/location`, sobre
`@nestjs/websockets` + `socket.io`) en vez de HTTP polling — soporta reconexión
nativa del lado del cliente y no ata el estado a la conexión: si el socket se
cae y reconecta, retoma exactamente donde quedó porque el estado real vive en
Redis, no en memoria del socket.

**Autenticación:** mismo mecanismo que el resto del backend
(`supabase.auth.getUser(token)` en el handshake, vía `client.handshake.auth.token`)
— nunca se confía en un `userId` que mande el cliente en el payload del mensaje.

**Validación (`location-normalizer.ts`), deliberadamente NO ingenua:**
- Rango de coordenadas, precisión (`accuracy`) y velocidad reportada por el
  dispositivo, con límites duros que rechazan basura evidente.
- Desfase de reloj: rechaza reportes con timestamp de cliente muy adelantado al
  del servidor.
- **Detección de salto implausible:** calcula la distancia real (Haversine)
  entre el reporte nuevo y la última posición conocida, y si la velocidad
  implícita supera ~360 km/h, lo rechaza como "teletransporte" (ruido de sensor,
  GPS glitch) — esto es exactamente lo que el fundador pidió no simplificar a
  "guardar lat/lng cada N segundos".
- Precisión baja (>100m) se acepta pero se marca (`quality: "low_accuracy"`), no
  se rechaza — GPS real varía y rechazar todo lo impreciso dejaría sin señal en
  interiores/zonas urbanas densas.

**Estado (`LocationStateService`):** Redis, no Postgres — "estado caliente" según
CLAUDE.md §7. Ventana de frescura de 30s para detectar pérdida de señal
(`stale`), TTL duro de 300s en Redis para no acumular claves huérfanas de
usuarios que se desconectaron por mucho tiempo.

**Decisión explícita de NO construir todavía:** una tabla PostGIS de histórico de
posiciones. Hoy no existe ningún consumidor real de ese histórico (llega con el
tracking del Emergency Corridor en Fase 3, o con reportes de trayecto). Crearla
ahora sería infraestructura sin evidencia de uso. El diseño ya deja el punto de
extensión claro: cuando exista ese consumidor, se agrega sin tocar el gateway ni
el normalizador — ninguno de los dos sabe ni le importa dónde se persiste el
histórico.

**Endpoint REST complementario** (`GET /location/me`, protegido por
`SupabaseAuthGuard`): para consultar el estado sin necesitar un cliente de
WebSocket — útil para depuración y para otros servicios que solo necesiten leer,
no transmitir.

## Verificación (real, sin mocks)

- `typecheck`/`lint`/`build`: limpios.
- **Rechazo de conexión sin token / con token inválido:** cliente real de
  `socket.io-client` contra el gateway real, con una llamada real (por red) a la
  API de Supabase Auth. Ambos casos quedaron rechazados y desconectados por el
  servidor, confirmado en los logs del proceso (`Conexión rechazada (sin
  token)`, `Conexión rechazada (token inválido)`).
- **Normalización/validación:** 4 casos ejecutados contra el código real
  compilado, con coordenadas reales de Medellín (centro y El Poblado, ~5.5km):
  reporte válido aceptado, baja precisión aceptada y marcada, coordenadas
  inválidas rechazadas, salto de 5.5km en 1 segundo rechazado como
  `implausible_jump`. Los 4 pasaron.
- **Redis real:** `LocationStateService` ejecutado contra una instancia real de
  Redis (no mock) — set + get de estado con round-trip correcto, y lectura de
  usuario sin estado devolviendo `null` correctamente. Los 2 pasaron.
- **Límite honesto de esta verificación:** no se probó el flujo de aceptación de
  principio a fin con un JWT real de usuario a través del propio WebSocket,
  porque generarlo requeriría credenciales que este entorno no debe manejar (ni
  la `service_role key` real ni tokens de sesión de usuarios reales). El camino
  de rechazo sí se probó con llamadas reales a Supabase; el camino de aceptación
  quedó probado en sus partes (normalización + Redis) por separado, con datos
  reales, no simulados. Queda como el primer punto a confirmar cuando el
  fundador conecte un cliente real (app o navegador) contra este gateway.

## Consecuencias

- `backend/src/modules/location/` es el único lugar donde vive lógica de
  ubicación; routing/geocoding (siguiente slice) van a inyectar/leer de aquí,
  nunca reimplementar validación de coordenadas por su cuenta.
- Sin CORS restringido todavía en el gateway (`origin: "*"`) — aceptable
  mientras no hay dominio de producción definido; queda anotado para
  restringirlo cuando exista.
- Sin autorización adicional más allá de "es un usuario autenticado" — no hay
  todavía un concepto de "quién puede ver la ubicación de quién" (eso lo va a
  necesitar el Emergency Corridor y cualquier feature de compartir ubicación en
  mensajería) — deliberadamente fuera de este slice.

## Referencias

- `docs/decisions/ADR-0007-backend-nestjs.md`, `ADR-0008-redis-upstash.md`
- `backend/src/modules/location/`
- https://docs.nestjs.com/websockets/gateways
