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
  sin resolver:** las tools del asistente (`list_chats`/`read_messages`/
  `send_message`) solo cubren chats 1 a 1 y mensajes de TEXTO — el asistente
  todavía no puede leer/mandar una nota de voz por voz (independiente de
  Gemini/Realtime; requeriría extender `MessagingModule` para tipo `"voice"`).
  Nota: el frontend de mensajería (`proyecto-mensajeria`) ya dejó de ser mock
  para notas de voz — ver el bullet siguiente.
- **Resuelto 2026-08-19 (ADR-0024):** notas de voz reales en
  `proyecto-mensajeria` — antes `VoiceRecorder.tsx`/`VoiceNotePlayer.tsx` eran
  100% decorativos (sin permiso de micrófono, sin grabación ni reproducción
  real). Ahora graban con `MediaRecorder` real, suben al bucket privado
  `voice-notes` (ya existía desde ADR-0001, sin migración nueva) y reproducen
  con `<audio>` real vía URL firmada. Fotos/documentos y grupos siguen siendo
  simulación local en `proyecto-mensajeria` (no hay dato real en Supabase
  todavía para esos tipos).
- **Resuelto 2026-08-19 (ADR-0025):** ubicación real (puntual y en vivo) en
  `proyecto-mensajeria` — antes `MOCK_CURRENT_LOCATION` era una coordenada
  fija y la "ubicación en vivo" nunca recibía posiciones nuevas. Ahora usa
  GPS real del navegador, geocodificación inversa vía el backend real
  (ADR-0010), inserción real en `messages`+`location_shares` (tabla ya
  existía desde ADR-0001, solo faltaba agregarla a la publicación
  `supabase_realtime`, migración de una línea), y `watchPosition` real con
  actualizaciones periódicas mientras dura la ubicación en vivo (15
  min/1 h/8 h). Ver `docs/decisions/ADR-0025-real-location-sharing-messaging.md`.
- **Resuelto 2026-08-26 (ADR-0029):** presencia "en línea", "escribiendo…" y
  "visto por última vez" reales en `proyecto-mensajeria` — antes
  `chat.activity` siempre era `"idle"` para chats reales y `participants`
  (usado para "en línea"/nombre/foto de terceros) era 100% `MOCK_PARTICIPANTS`,
  sin ninguna relación con datos reales. Ahora `participants` se arma con
  perfiles reales de `profiles`; "en línea" usa Supabase Realtime Presence;
  "escribiendo…" usa Broadcast efímero por chat (nunca se escribe en la
  base); "visto por última vez" escribe `profiles.last_seen_at` de verdad
  (heartbeat) y respeta `last_seen_visibility` (columna y función
  `is_contact_of` que ya existían desde ADR-0001, sin conectar). Sigue sin
  construir: presencia/"escribiendo…" dentro de grupos (por remitente
  específico) y aviso real de `"recording_audio"` (notas de voz no avisan
  actividad todavía). Ver
  `docs/decisions/ADR-0029-real-presence-typing-last-seen.md`.
- **Resuelto 2026-08-27 (ADR-0030):** recordatorios de nota a hora fija con
  BullMQ — `location_reminders.remind_at` (nueva columna, migración real,
  restringida a `kind: "note"`), `NoteReminderSchedulerService` (encola/
  cancela el job, en `LocationRemindersModule`) y `NoteReminderProcessor`
  (dispara el aviso vía `LocationBroadcastService.notify` sobre `/location`,
  en `LocationModule`) conectados por nombre de cola, no por import.
  `PATCH /location-reminders/:id/remind-at` programa/reprograma/quita.
  Sigue sin construir: aviso por voz (`create_reminder` dictado, depende del
  asistente de voz, fuera de alcance por decisión del fundador) y push real
  (FCM/APNs, Fase 5) — sin eso, el aviso solo llega con la app abierta y el
  socket `/location` conectado. Ver
  `docs/decisions/ADR-0030-bullmq-fixed-time-note-reminders.md`.

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
  notificación push cuando la app está cerrada (Fase 5), recordatorios
  recurrentes (no pedidos todavía). **Corrección:** el dictado por voz de
  este tipo de recordatorio NO estaba pendiente — `create_location_reminder`
  (ADR-0016) ya lo cubre desde ese slice; la nota anterior aquí lo daba por
  "futuro" por error, corregido el 2026-08-19.
- **Actualizado 2026-08-19 (ADR-0023):** "Notas" (antes 100% local/mock, sin
  backend) y "Recordatorios" se unificaron en una sola sección —
  `location_reminders` extendida con `kind` (`"location"`\|`"note"`),
  `title`, `is_task`, `completed_at`, `archived_at`; `latitude`/`longitude`
  ahora nullable con un constraint que exige coordenadas solo para
  `kind: "location"`. Notas y tareas (sin ubicación) ahora tienen backend
  real por primera vez. Ver `docs/decisions/ADR-0023-unified-notes-and-reminders.md`.
- **Resuelto 2026-08-27 (ADR-0030):** recordatorios por tiempo (hora fija,
  no geofence) — ver detalle en la sección "Backend" arriba. Este era el
  gap real restante de esta sección tras ADR-0023.

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
  **Actualizado 2026-08-19 (4, cierre de corredor):** `POST
  /emergency/corridor/close` (`{reason: "completed"|"cancelled"}`) — cierra
  la ruta activa de la ambulancia (`RouteSessionService.clear`) y avisa
  `corridor:closed` a todos los candidatos alertados durante el traslado,
  usando un set nuevo en Redis (`corridor:alerted:{ambulanceDriverId}`,
  TTL espejo de la sesión de ruta) que `AlertPolicyService` llena en cada
  alerta y limpia al cerrar. `expired` no tiene código propio — el TTL de la
  ruta y del set de alertados vencen solos si nadie cierra a mano; sin job
  de barrido todavía (sin evidencia de que la espera silenciosa de 4h sea un
  problema real). Ver `docs/decisions/ADR-0020-emergency-corridor-closure.md`.
  Verificado con Redis real, 11/11 casos (incluye doble cierre sin error).
  **Actualizado 2026-08-19 (5, buffer dinámico + severidad):** el radio fijo
  de 200m se reemplazó por `buffer = clamp(150 + velocidad_mps × 8, 150,
  400)` metros, usando la velocidad real reportada por la ambulancia
  (`location.speed`). Cada candidato ahora trae `severity`
  (`info`/`warning`/`critical`), calculada como fracción del buffer del
  momento (25%/60%), no de una distancia fija — conectada también al evento
  `corridor:alert` y a la pantalla de Emergencia del frontend (insignia de
  color). Números elegidos por decisión delegada explícitamente por el
  fundador ("la decisión se la dejo a usted"), documentados como ajustables
  con evidencia real, no definitivos. Ver
  `docs/decisions/ADR-0021-corridor-dynamic-buffer-severity.md`. Verificado
  con Redis real + fixture de ruta real (mismo decodificador de producción),
  16/16 casos — incluye el caso de velocidad de GPS con ruido (200 m/s)
  confirmando que el buffer no crece sin límite.
  Todavía en 0%: estados `ACTIVE_CONFLICT`/`PASSED` (necesitan
  trayectoria/velocidad relativa del candidato, dato inexistente todavía),
  tracking histórico GPS, job de barrido para expiración silenciosa —
  diferido a propósito, sin evidencia de necesidad todavía.

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

- **Actualizado 2026-08-19 (primer slice real):** `SimulationEngineService`
  construido — alimenta posiciones sintéticas a los servicios REALES del
  Conflict Engine (`LocationStateService`, `RouteSessionService`,
  `EmergencyCorridorService`, `AlertPolicyService`), no una copia paralela.
  Escenario 1 del roadmap ("una ambulancia / 10 vehículos") implementado y
  verificado. `POST /simulation/scenarios/:name/run` (sin UI todavía).
  Encontró y corrigió un bug real en `EmergencyCorridorService.sampleAhead`
  (muestreaba por índice de punto crudo, no por distancia real — dejaba
  huecos reales sin cubrir en rutas con pocos waypoints). Ver
  `docs/decisions/ADR-0022-simulation-engine-first-slice.md`. Verificado
  con Redis real, 18/18 casos (incluye determinismo: misma corrida dos
  veces produce el mismo patrón de detección).
  Todavía en 0%: escenarios 2–12 del roadmap (varias ambulancias
  simultáneas, GPS con ruido/atraso, desconexión, corredores cruzados,
  etc.) — se agregan uno a la vez; métricas de falsos positivos/conflictos
  perdidos (necesitan verdad de terreno explícita, no modelada todavía).

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
- **Agregado 2026-08-19 (decisión del fundador — verificación de
  ambulancias):** la verificación sigue siendo revisión manual del fundador
  (no autoservicio, ya bloqueado técnicamente desde ADR-0006), pero con una
  pantalla de aprobación real en vez de editar filas de Supabase a mano —
  el conductor queda como solicitud pendiente por placa, el fundador la
  aprueba/rechaza desde una vista simple. Cero código todavía — es el
  siguiente slice natural sobre `emergency_vehicles` (ADR-0006), no una
  tabla nueva.
- **Actualizado 2026-08-19 (diseño listo, ver ADR-0026):** los mensajes de
  `proyecto-mensajeria` serán cifrados de extremo a extremo real — ni el
  fundador ni este backend podrán leer el contenido, ni siquiera con acceso
  admin. Hoy NO existe ningún cifrado (los mensajes son filas de texto plano
  en Supabase). El diseño del protocolo ya está definido (a pedido explícito
  del fundador: "libsodium.js" / `crypto_box`, claves generadas en el
  dispositivo, tabla nueva `user_encryption_keys`) — ver
  `docs/decisions/ADR-0026-e2e-encryption-protocol-design.md`. Cero código
  todavía, sigue siendo el siguiente paso. Consecuencia directa para el
  panel admin y para las tools de asistente `read_messages`/`send_message`
  (ADR-0018): solo podrán ver/manipular METADATOS o ciphertext opaco, nunca
  contenido en claro — incluye una tensión real todavía sin decidir con el
  fundador: leer un mensaje recibido en voz alta ya no podría hacerse desde
  el backend, tendría que pasar a ser 100% client-side.
- **Confirmado 2026-08-19 (decisión del fundador — empaquetado móvil):**
  Android primero, confirmado explícitamente por el fundador ("nos vamos por
  la opción de desarrollo en Android para hacer las pruebas más adelante"),
  con iOS agregado después reusando el mismo envoltorio Capacitor. Cero
  código todavía — la app hoy es 100% web (TanStack Start), sin ningún
  envoltorio nativo; empaquetar Android queda como trabajo pendiente, no
  bloqueante para los slices de mensajería en curso.
- **Agregado 2026-08-19, pivoteado el mismo día (ver ADR-0027):** wake word
  general + verificación de quién habla. Originalmente el fundador pidió
  nombre personalizado del asistente (ej. "Estefa") + wake word — la
  auditoría encontró un bloqueo real incluso para el campo simple de
  nombre: `updateProfile` (`useProfile.ts`) era 100% local/mock, nunca
  escribía en `profiles` — **resuelto 2026-08-20, ver ADR-0028**: nombre,
  "acerca de" y foto de perfil ahora persisten de verdad (`UPDATE profiles`
  + subida real al bucket `avatars`), verificado con RLS real. Ya no es un
  prerequisito pendiente si se retoma el nombre personalizado. El mismo día
  del hallazgo original, el fundador pidió suspender la personalización
  por nombre (para no trabarse ahí) y priorizar algo distinto y más
  importante: que el sistema identifique QUIÉN habla, para que un comando
  de voz ("envía este mensaje") no lo dispare un tercero o ruido de fondo.
  Wake word (genérico, sin nombre por cliente) sigue necesitando un motor
  local en el dispositivo — precios reales investigados: Picovoice gratis
  = 1 usuario/mes, ~US$6,000/año = 100 usuarios, o `openWakeWord` gratis
  sin soporte oficial de Android. Verificación de hablante es tecnología
  DISTINTA (no detecta la palabra, identifica la voz) — investigado y
  confirmado activo **Picovoice Eagle** (100% on-device, enrolamiento en
  segundos, verifica desde un solo comando), precio no publicado. Mitigación
  ya existente hoy sin código nuevo: las acciones sensibles ya exigen
  confirmación explícita antes de ejecutarse (ADR-0016/0018). Ver
  `docs/decisions/ADR-0027-assistant-custom-name-and-wake-word-design.md`.
  Cero código todavía.

**Actualizado 2026-08-18 (tarde):** el proyecto Supabase "Copiloto" ya existe
(`wrkuusacwkdazfwynhkz`, región `ca-central-1`, `ACTIVE_HEALTHY`, creado 2026-08-16).
Verificado vía `mcp__Supabase__list_tables` — **0 tablas todavía**, es decir, el
proyecto está creado pero sin esquema aplicado. Ya no es un bloqueo: el siguiente paso
es aplicar el esquema de `docs/architecture/Especificacion-Backend-Supabase-CoPiloto.md`
como migraciones reales.
