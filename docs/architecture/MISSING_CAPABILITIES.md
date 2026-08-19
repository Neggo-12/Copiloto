# MISSING_CAPABILITIES.md

Brecha entre la visión (`PROMPT_MAESTRO_CLAUDE_CODE.md`, `docs/product/`) y lo que
existe hoy en el repositorio. Todo lo listado aquí es **CREAR**, no reutilizar — no hay
código previo para ninguno de estos puntos.

## Backend

**Actualizado 2026-08-18:** la base de datos y el storage YA EXISTEN y están
aplicados sobre el proyecto Supabase "Copiloto" — 13 tablas, RLS en todas, 4 buckets
con políticas (ver `docs/decisions/ADR-0001-esquema-backend.md` y
`supabase/migrations/`). Sigue faltando todo lo demás:

- **Resuelto 2026-08-18 (decisión del fundador):** se introduce `backend/`
  (NestJS, modular monolith) ya, en paralelo a `proyecto-mensajeria/` que sigue
  consumiendo Supabase directo (no se migra, no hay evidencia que lo justifique).
  Primer slice: `SupabaseModule` (cliente service role), `SupabaseAuthGuard`
  (valida JWT de Supabase Auth), `GET /health`, `GET /emergency/vehicles/me`. Ver
  `docs/decisions/ADR-0007-backend-nestjs.md`. Los dominios restantes
  (`identity/users/devices/contacts/messaging/media/notifications/assistant/
  reminders/location/maps/navigation/emergency/mobility/traffic/audit/simulation`)
  se agregan como módulos conforme haya trabajo real, no todos de una vez.
- **Resuelto 2026-08-18:** PostGIS 3.3.7 habilitado en el proyecto (schema
  `extensions`), como parte de la Fase 1 del cronograma de Emergency Corridor.
- **Resuelto 2026-08-19:** Redis + BullMQ conectados como infraestructura real
  (Upstash, decisión definitiva del fundador). `RedisModule`/`QueueModule` en
  `backend/`, registro central de colas (`emergency-alerts`/`location-reminders`
  reservadas sin processor todavía; cola `system` con job `ping` como prueba de
  humo real, verificada de punta a punta contra un Redis real). Ver
  `docs/decisions/ADR-0008-redis-upstash.md`.
- WebSockets/tiempo real: la tabla existe, pero no se activó ninguna suscripción
  Realtime ni se escribió código que la use.
- Auth real: **parcial, 2026-08-18.** Verificación telefónica ya conectada a
  Supabase Auth real (`signInWithOtp`/`verifyOtp`) usando **Test OTP** (números de
  prueba, sin costo) mientras no se decida el proveedor de SMS de producción
  (Twilio/MessageBird/Vonage). Falta: registrar los números de Test OTP en el
  Dashboard de Supabase (paso manual, sin tool de MCP para esto), y el proveedor
  de correo real para el flujo de verificación de email (sigue simulado).
- Vistas de `unreadCount`/`lastMessagePreview` (pendiente del ADR-0001).
- Job/Edge Function de limpieza de `status-media` tras 24h.
- Cliente API en el frontend: **resuelto parcialmente, 2026-08-18.**
  `@supabase/supabase-js` ya está instalado y conectado (`src/lib/supabase/client.ts`,
  con almacenamiento de sesión en memoria — ver nota de seguridad en ese archivo —
  y `src/lib/actions/auth.ts` ya habla con el backend real para OTP). El resto de
  dominios (chats, contactos, notas, estados) siguen 100% en mock-data en memoria.

## Asistente de voz

- **Actualizado 2026-08-19 (primer slice real):** Tool Registry + capa de
  autorización/confirmación construidas — `AssistantModule`, 6 tools reales
  (`create_location_reminder`, `calculate_route`,
  `activate_emergency_corridor`, `set_driving_mode`, `get_driving_mode`,
  `list_vehicles`), cada una llamando a servicios de dominio ya existentes
  y ya verificados (ninguna toca Postgres/Redis/Google directo).
  `activate_emergency_corridor` exige autorización real
  (`EmergencyVehiclesService`, verificado+activo) y confirmación explícita
  antes de ejecutar el efecto real (`needs_confirmation` → segunda llamada
  con `confirmed: true`). `GET /assistant/tools`,
  `POST /assistant/tools/:toolName/execute`. Ver
  `docs/decisions/ADR-0016-assistant-tool-registry.md`. Verificado con un
  arranque real del `AppModule` completo (grafo de DI de los 6 módulos que
  consume, sin ciclos) y 17/17 casos de lógica de negocio (autorización,
  gating de confirmación, validación) contra stubs honestos de Google
  Maps/Postgres — esas piezas ya se verificaron reales por separado.
- Modo conducción (UI/estado que active la sesión de voz) — estado de
  cliente/app, no de este backend; sin evidencia todavía de necesitar
  coordinación server-side.
- Integración Realtime/STT (OpenAI Realtime u otro adapter) — requiere que
  el fundador provisione cuenta/API key (mismo tipo de paso que Google Maps
  Platform en ADR-0010). Cuando exista, se conecta al Tool Registry ya
  construido: `GET /assistant/tools` como config de `tools` de la sesión,
  cada function-call de OpenAI → `POST /assistant/tools/:toolName/execute`.
- **Resuelto 2026-08-19:** tools de mensajería construidas — `list_chats`,
  `read_messages`, `send_message` en `backend/src/modules/assistant/tools/`,
  sobre un nuevo `MessagingModule` que envuelve las MISMAS tablas que ya usa
  `proyecto-mensajeria` (`chats`, `chat_participants`, `messages`,
  `contacts`, `profiles`). Autorización reimplementada a mano (mismo criterio
  que la RLS real: `sender_id` siempre es el `userId` del JWT, nunca un
  argumento; se verifica pertenencia al chat antes de leer o escribir).
  `send_message` exige confirmación explícita (`requiresConfirmation =
  true`), mismo criterio que `activate_emergency_corridor`. Ver
  `docs/decisions/ADR-0018-messaging-bridge.md`. **Alcance a propósito, sigue
  sin resolver:** solo chats 1 a 1 y mensajes de TEXTO — notas de voz,
  fotos/documentos, ubicación y grupos siguen siendo simulación local en
  `proyecto-mensajeria` (no hay dato real en Supabase todavía), así que el
  asistente tampoco puede leer/mandar una nota de voz de verdad hoy. Esto es
  independiente de Gemini/Realtime.
- `create_reminder` (por tiempo, hora fija, BullMQ) — tipo de recordatorio
  distinto a `create_location_reminder` (geofence, ya existe); sigue sin
  construir, depende de jobs con BullMQ.

## Location / Maps / Navigation

- **Actualizado 2026-08-19:** primer slice construido — `LocationGateway`
  (WebSocket, namespace `/location`, auth Supabase JWT), validación no ingenua
  (`location-normalizer.ts`: rango/precisión/velocidad, desfase de reloj,
  detección de salto implausible vía Haversine), estado caliente en Redis
  (`LocationStateService`, TTL 300s, ventana stale 30s) y `GET /location/me`.
  Ver `docs/decisions/ADR-0009-location-engine.md`. Persistencia histórica en
  PostGIS deliberadamente NO construida todavía (sin consumidor real).
- **Actualizado 2026-08-19 (2):** segundo slice construido — `RoutingProvider`
  (Google Routes API, `computeRoutes`) y `GeocodingProvider` (Google Geocoding
  API, forward + reverse), detrás de interfaces intercambiables por proveedor,
  con endpoints `/navigation/route`, `/navigation/geocode`,
  `/navigation/reverse-geocode` (protegidos, `SupabaseAuthGuard`). Ver
  `docs/decisions/ADR-0010-navigation-google-maps.md`. `GOOGLE_MAPS_API_KEY`
  todavía no está provisionada por el fundador — código verificado por
  typecheck/lint/build, verificación real contra la API pendiente de la key.
  Aclaración: "Navigation SDK" de Google es un SDK de cliente (Android/iOS),
  no una API de backend — no existe un `NavigationProvider` de backend
  separado; la lógica de navegación de backend (ETA, futuro desvío de ruta)
  se construye sobre `RoutingProvider`. **Verificado real 2026-08-19:**
  llamadas reales contra Google con la key de producción del fundador —
  Geocoding (`Parque Berrío, Medellín` → status OK, coordenadas correctas) y
  Routes (Parque Berrío → El Poblado → 7.287m, ~18min, polyline real).
  Pendiente:
- **Actualizado 2026-08-19 (3):** tercer slice construido — `RouteSessionService`
  (ruta activa por usuario en Redis) y detección de desvío
  (`route-deviation.ts`, distancia real Haversine al punto más cercano de la
  ruta decodificada). `POST/DELETE /navigation/route-session` para arrancar/
  cerrar; `LocationGateway` calcula desvío en cada `location:update` si hay
  ruta activa. Ver `docs/decisions/ADR-0011-route-deviation.md`. Verificado
  con datos reales: decodificación + cálculo de distancia contra la polyline
  real devuelta por Google (ADR-0010), y persistencia contra Redis real —
  6/6 y 4/4 casos, respectivamente. Es la misma pieza matemática que
  necesitará el Conflict Engine de Emergency Corridor (Fase 3).
- Permisos y sesión de ubicación foreground (lado cliente/app).
- `PlacesProvider` (diferido — sin consumidor real todavía).
- Recompute automático de ruta al detectar desvío (diferido — decisión de
  producto/UX no definida todavía; cada recálculo tiene costo real).
- **Actualizado 2026-08-19 (Fase 7 real, primer slice):** recordatorios por
  ubicación construidos — `location_reminders` (Postgres, autoservicio, RLS
  `user_id = auth.uid()`), `GeofenceTriggerService` (evalúa Haversine contra
  la posición actual en cada `location:update`, dispara una sola vez de
  forma idempotente), `ReminderCacheService` (Redis, lectura-a-través, evita
  consultar Postgres en cada ping de ubicación — mismo motivo que ADR-0013).
  `GET/POST /location-reminders`, `DELETE /location-reminders/:id`. No
  geocodifica direcciones de texto internamente — reutiliza
  `GET /navigation/geocode` (ADR-0010) del lado del llamador, evitando un
  ciclo de módulos. Ver `docs/decisions/ADR-0015-location-reminders.md`.
  Verificado con RLS real (simulación transaccional, incluye idempotencia
  del disparo confirmada con conteo de filas) y un smoke test real contra
  Redis local (13/13 casos). Pendiente: integración HTTP/WebSocket de
  punta a punta con JWT real (mismo límite documentado desde ADR-0009),
  notificación push cuando la app está cerrada (Fase 5), dictado por voz
  (Fase 6), recordatorios recurrentes (no pedidos todavía).
- Recordatorios por tiempo (jobs con BullMQ) — tipo de recordatorio
  distinto (hora fija, no geofence), sigue sin construir.

## Emergency Corridor / Mobility / Traffic

- **Actualizado 2026-08-18:** primera porción construida — tabla
  `emergency_vehicles` (autorización de ambulancias verificadas, RLS sin
  autoservicio) y helper `is_verified_ambulance_driver()`. Ver
  `docs/decisions/ADR-0006-emergency-corridor.md`.
- **Actualizado 2026-08-19:** primer slice real del Conflict Engine —
  `EmergencyCorridorService.findCandidates()`: el corredor es la ruta activa
  de la ambulancia (reusa `RouteSessionService`), índice geoespacial en Redis
  (`LocationStateService.findNearby`, `GEOSEARCH`) para encontrar candidatos
  dentro de un buffer fijo de 200m muestreando hacia adelante sobre la ruta.
  `GET /emergency/corridor/candidates`, solo para ambulancias
  verificadas+activas. Ver `docs/decisions/ADR-0012-emergency-corridor-candidates.md`.
  Verificado con 7/7 casos reales (Redis GEO real + polyline real de Google).
  **Actualizado 2026-08-19 (2):** Alert Policy real — dedup + cooldown
  atómico en Redis (`AlertPolicyService`, `SET NX EX` 30s) y entrega por el
  mismo WebSocket de `/location` (`LocationBroadcastService`, cada socket se
  une a una room por `userId`). Mensaje base único para todos los candidatos
  (diferenciar carro/moto queda pendiente — no hay dato de tipo de vehículo
  todavía). Ver `docs/decisions/ADR-0013-alert-policy.md`. Verificado con
  Redis real (5/5 casos) y con un servidor+cliente Socket.IO reales (3/3
  casos, entrega real por WebSocket confirmada).
  **Actualizado 2026-08-19 (3, cierre del gap de diferenciación):**
  `AlertPolicyService` ahora incluye `recommendedChannel` en cada evento
  `corridor:alert` (`"visual_audio"` para carro, `"voice_priority"` para
  moto, `"default"` para quien no fijó Modo de manejo), usando
  `DrivingModeService` real — el texto del mensaje sigue siendo el mismo
  para todos a propósito (el fundador dio una sola frase exacta; el canal
  de entrega es lo que se diferencia, no la redacción). Ver
  `docs/decisions/ADR-0017-alert-channel-differentiation.md`. Verificado
  con Redis real, 6/6 casos.
  Todavía en 0%: buffer dinámico por velocidad, estados `ACTIVE_CONFLICT`/
  `PASSED`, severidad `INFO`/`WARNING`/`CRITICAL`, cierre de corredor
  (`completed`/`cancelled`/`expired`), tracking histórico GPS — diferido a
  propósito, sin evidencia de necesidad todavía.

**Actualizado 2026-08-19 (registro de vehículos y modo de manejo):** tabla
`user_vehicles` (Postgres, autoservicio, RLS `user_id = auth.uid()`, a lo
sumo un carro y una moto por usuario) y `DrivingModeService` (Redis, TTL
24h, "cuál vehículo estoy usando ahora"). `VehiclesModule` con
`GET/POST/DELETE /vehicles/:vehicleType` y
`GET/POST/DELETE /vehicles/driving-mode`. Ver
`docs/decisions/ADR-0014-vehicle-registration-and-driving-mode.md`.
Verificado con RLS real (simulación transaccional con JWT real: dedup de
tipo, aislamiento entre usuarios, unicidad por tipo, todos confirmados) y
`get_advisors` sin alertas nuevas. Desbloqueó la diferenciación carro/moto
de Alert Policy — ya conectada (ver arriba, ADR-0017).
- `MobilityEvent`, `HeavyVehicleEvent`, `TrafficObservation`, `TrafficRisk`.
- Abstracciones `SignalProvider` / `PriorityDecisionEngine` (semáforos) — ni siquiera
  el `SimulationSignalProvider` inicial existe.

## Simulación

- Motor de simulación (`VirtualAmbulance`, `VirtualCar`, `VirtualMotorcycle`,
  `VirtualRoute`, `SimulationEvent`) — no existe código.
- Ningún escenario de prueba (ruido GPS, pérdida de conexión, corredores
  superpuestos, etc.) está implementado.

## Calidad / Verificación

- Sin suite de tests (no hay `vitest`/`jest` en `package.json`, ni carpetas `__tests__`).
- Sin script `typecheck` explícito (hay `tsconfig.json`, pero ningún script lo ejecuta
  de forma aislada — solo se valida implícitamente al hacer `vite build`).
- Sin CI configurado (no se encontró `.github/workflows/` ni equivalente).
- Sin `DEPENDENCIES.md` (requerido por `PROMPT_MAESTRO_CLAUDE_CODE.md` §25).

## Producto / Decisiones abiertas

- Proveedor de SMS/OTP sin decidir (Twilio/MessageBird/Vonage).
- Decisión de patentar/proteger la plataforma, marcada como prioridad, sin resolver.
- **Agregado 2026-08-19 (ver ADR-0013):** permisos de ubicación de la futura
  app cliente. Para que Emergency Corridor funcione de verdad (que una
  ambulancia detecte candidatos reales, no una lista vacía), la app necesita
  pedir permiso de ubicación (mínimo "mientras se usa la app") y reportar
  posición de forma continua por el WebSocket de `/location` mientras está
  abierta — no solo durante navegación activa, también mientras el usuario
  está en mensajería, dejando un recordatorio, o hablando con el asistente.
  El backend ya lo soporta sin cambios (`location:update` no depende de
  tener una ruta activa); falta la decisión de producto de qué tipo de
  permiso pedir y cuándo, y la implementación del lado del cliente (todavía
  sin construir).
- **Resuelto 2026-08-19 (ver ADR-0014):** tipo de vehículo del usuario
  (carro/moto) ya se captura (`user_vehicles`). Sigue abierta la conexión de
  ese dato con el Alert Policy de Emergency Corridor (visual+audio para
  carro, voz prioritaria para moto) — el dato existe, falta el trabajo de
  conectarlo.
- **Agregado 2026-08-19:** unicidad global de placa (`plate`) — hoy
  `user_vehicles` no impide que dos usuarios distintos registren la misma
  placa. El fundador mencionó un propósito de seguridad futuro ("luego nos
  puede servir") sin definir el caso de uso real todavía (quién consulta,
  cuándo, con qué autorización) — agregar la restricción sin ese caso de uso
  sería complejidad sin evidencia. Pendiente de decisión de producto.
- **Agregado 2026-08-19:** velocidad por sectores — comparar velocidad
  actual del usuario contra un límite local y mostrar un mensaje. Pedido
  explícitamente como PENDIENTE por el fundador. Restricción de tono ya
  fijada para cuando se construya: **informativo, nunca punitivo ni
  alarmante** ("no se estas siendo irresponsable" — no debe sonar así).
  Cero código todavía; ni siquiera diseño de dónde saldría el dato de límite
  de velocidad por sector.

**Actualizado 2026-08-18 (tarde):** el proyecto Supabase "Copiloto" ya existe
(`wrkuusacwkdazfwynhkz`, región `ca-central-1`, `ACTIVE_HEALTHY`, creado 2026-08-16).
Verificado vía `mcp__Supabase__list_tables` — **0 tablas todavía**, es decir, el
proyecto está creado pero sin esquema aplicado. Ya no es un bloqueo: el siguiente paso
es aplicar el esquema de `docs/architecture/Especificacion-Backend-Supabase-CoPiloto.md`
como migraciones reales.
