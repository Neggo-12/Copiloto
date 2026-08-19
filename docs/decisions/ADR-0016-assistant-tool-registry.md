# ADR-0016 — Tool Registry del Asistente de voz (Fase 6, primer slice)

**Fecha:** 2026-08-19
**Estado:** Aceptado — verificado con un arranque real de Nest (grafo de DI
completo de `AppModule`, no solo el módulo nuevo aislado) y con la lógica de
negocio de cada tool probada contra stubs honestos de sus dependencias
externas (Google Maps, Postgres — ambos ya verificados reales en
ADR-0010/0014/0015 por separado). Sin integración Realtime/STT todavía —
ver "Alcance" abajo.

## Contexto

Fase 6 completa, según el skill del proyecto y `MISSING_CAPABILITIES.md`,
requiere: Modo conducción (UI/estado cliente), integración Realtime/STT
(OpenAI Realtime u otro proveedor), un Tool Registry, y una capa de
autorización/política entre el LLM y los servicios de dominio.

De esas cuatro piezas, **el Tool Registry y la capa de autorización/
confirmación son las únicas que se pueden construir y verificar de verdad
hoy** sin depender de que el fundador provisione una cuenta/API key de
Realtime (mismo tipo de bloqueo real que tuvo Google Maps antes de
ADR-0010, no una excusa). Construirlas primero, bien hechas y con la
autorización real ya conectada a los servicios de dominio que SÍ existen,
es la base sobre la que se conecta el proveedor de voz después — conectar
el proveedor sin esta base habría significado reconstruirla apurado
después, o peor, dejar que el LLM llame servicios sin pasar por
autorización real.

## Decisión

**Pipeline implementado, tal como lo define el skill del proyecto:**

```
Voice → Realtime/STT → Tool Call → Authorization/Confirmation →
Application Service → Domain → Result → Voice
```

Este ADR cubre **Tool Call → Authorization/Confirmation → Application
Service → Domain → Result**. "Voice → Realtime/STT" y "Result → Voice" son
el proveedor de voz, todavía sin conectar (ver "Alcance").

**Cada tool es una clase real (`AssistantTool`), no una función suelta:**
`name`, `description`, `parameters` (JSON Schema — el mismo formato que
espera la config `tools` de function-calling de OpenAI Realtime, así que
`GET /assistant/tools` se le puede pasar tal cual el día que se conecte),
`requiresConfirmation`, y `execute(ctx, args)`. `AssistantToolsService` es
el único punto de despacho: recibe `(toolName, {userId, confirmed}, args)`
y nunca deja escapar una excepción cruda — cualquier fallo inesperado se
convierte en un `{status:"error", message}` conversacional, porque el
consumidor final de esto es una voz sintética, no un log de servidor.

**La IA nunca toca Postgres/Redis/Google directo — regla de seguridad ya
existente del proyecto, aplicada literalmente aquí.** Cada tool llama a un
servicio de aplicación que YA existe y YA se verificó real por separado:
`LocationRemindersService` (ADR-0015), `RoutingProvider`/
`GeocodingProvider` (ADR-0010), `VehiclesService`/`DrivingModeService`
(ADR-0014), `EmergencyVehiclesService`/`RouteSessionService` (ADR-0006/
0011). No se creó ningún acceso nuevo a infraestructura — el Tool Registry
es una capa de orquestación sobre lo que ya existe, REUSE puro.

**Autorización real, no simulada, para la tool de mayor riesgo.**
`activate_emergency_corridor` llama a `EmergencyVehiclesService.
getStatusForDriver()` — el mismo chequeo que ya usa
`EmergencyCorridorController` — y devuelve `denied` si el usuario no es
ambulancia verificada+activa, **antes** de tocar geocoding/routing/route-
session. Nunca confía en lo que diga la voz sobre quién es el usuario.

**Confirmación explícita para la única tool con efecto de alto riesgo.**
`requiresConfirmation = true` solo en `activate_emergency_corridor`: la
primera llamada sin `confirmed: true` devuelve `needs_confirmation` con un
resumen en texto (`"Vas a activar el corredor de emergencia hacia X.
¿Confirmas?"`) y **no ejecuta ningún efecto real** — ni geocoding, ni
routing, ni `RouteSessionService.start()` — hasta que llega una segunda
llamada con `confirmed: true`. Verificado explícitamente: `routeSession.
start` no se invoca en la primera llamada, sí en la segunda. Las otras
cinco tools no requieren confirmación — son de bajo riesgo y reversibles
(`create_location_reminder` se puede borrar, `set_driving_mode` se puede
recambiar, el resto es de solo lectura).

**`activate_emergency_corridor` NO duplica `POST /navigation/route-
session`** — llama a los mismos servicios inyectados
(`GeocodingProvider`, `RoutingProvider`, `LocationStateService`,
`RouteSessionService`) directamente, sin una llamada HTTP interna a sí
mismo. Mismo principio ya usado en `EmergencyCorridorController`: "el
corredor ES la ruta activa", no un concepto duplicado.

**`calculate_route` usa el Modo de manejo actual (ADR-0014) para elegir
`TravelMode`**, en vez de preguntar "¿carro o moto?" en cada cálculo si el
usuario ya lo fijó — `travelModeFromDrivingMode()` es la única función que
traduce esa decisión, reutilizada donde haga falta.

**Endpoints (`AssistantModule`, `SupabaseAuthGuard`):**

- `GET /assistant/tools` — el registro completo (para el futuro bootstrap
  de la sesión Realtime, y para poder inspeccionar/probar las tools hoy sin
  esperar esa integración).
- `POST /assistant/tools/:toolName/execute` — ejecuta una tool. El mismo
  camino que usará el evento de function-call de Realtime cuando exista —
  no una versión de prueba aparte que habría que reconciliar después.

## Alcance — qué NO se construyó en este slice, y por qué

- **Integración Realtime/STT real (OpenAI u otro proveedor):** requiere que
  el fundador provisione y configure una cuenta/API key — mismo tipo de
  paso que Google Maps Platform en ADR-0010 (facturación, credenciales, no
  algo que se pueda hacer por el usuario). Cuando esté lista, conectar
  consiste en: bootstrapear la sesión Realtime con `GET /assistant/tools`
  como config de `tools`, y traducir cada evento de function-call de
  OpenAI a `POST /assistant/tools/:toolName/execute` — la parte cara
  (autorización, confirmación, servicios de dominio) ya está.
- **Modo conducción (UI/estado que activa la sesión de voz):** es estado de
  cliente/app (¿está el micrófono streameando ahora?), no del backend — no
  hay nada que este backend deba modelar todavía. Se revisará si aparece
  evidencia real de necesitar coordinación server-side (ej. saber desde
  otro dispositivo si el modo voz está activo).
- **Tools de mensajería (`read_message`, `send_message`):** el dominio de
  mensajería vive hoy en `proyecto-mensajeria/` hablando con Supabase
  directo — no existe una capa de aplicación NestJS que envolver todavía
  (eso es trabajo de Fase 5, "Mensajería pendiente", explícitamente en
  paralelo). Construir estas tools ahora habría significado o (a) la IA
  hablando con Supabase directo — viola la regla de seguridad del
  proyecto — o (b) construir apurado un backend de mensajería solo para
  desbloquear esto. Ninguna opción es honesta; queda documentado como
  gap real en `MISSING_CAPABILITIES.md`, no fingido.
- **`create_reminder` (por tiempo, no por ubicación):** depende de jobs
  BullMQ para recordatorios con hora fija, todavía sin construir — tipo de
  recordatorio distinto a `create_location_reminder` (geofence), que sí
  existe.

## Verificación (real, sin mocks de infraestructura ya probada)

- `typecheck`/`lint`/`build`: limpios.
- **Arranque real de `AppModule` completo** (no solo `AssistantModule`
  aislado) vía `@nestjs/testing`, con Redis real local (loopback — BullMQ
  necesita una conexión ioredis real que emita eventos, no se puede fakear
  con un objeto plano) y Supabase/Google Maps reemplazados por fakes
  inertes (sin conexión persistente que esperar). Confirma que el grafo de
  DI completo — los 6 módulos que `AssistantModule` importa
  (Navigation, Location, RouteSession, Emergency, Vehicles,
  LocationReminders) más los 6 providers de tools — resuelve sin ciclos ni
  dependencias faltantes. El registro expuesto por `GET /assistant/tools`
  equivalente (`AssistantToolsService.list()`) trae exactamente las 6
  tools esperadas, con `requiresConfirmation` correcto en cada una.
  `@nestjs/testing` se agregó como devDependency solo para esta prueba y
  se removió después (mismo patrón ya usado con `socket.io-client` en
  ADR-0013) — `package.json`/`bun.lock` quedaron sin rastro.
- **Lógica de negocio de cada tool, con Google Maps/Postgres reemplazados
  por stubs honestos** (esas piezas ya se verificaron reales por separado
  en sus propios ADRs — aislar así evita reverificar lo ya probado, mismo
  criterio que el resto de smoke tests de este proyecto). 17/17 casos:
  - `create_location_reminder`: valida campos faltantes, maneja dirección
    no encontrada como error conversacional (no excepción), geocodifica
    antes de crear, crea el recordatorio con las coordenadas resueltas.
  - `calculate_route`: caso feliz con distancia/duración reales del stub,
    elige `TravelMode` según el Modo de manejo actual (carro→DRIVE,
    moto→TWO_WHEELER), falla claro sin ubicación actual.
  - `activate_emergency_corridor`: usuario no verificado → `denied`;
    verificado pero inactivo → también `denied`; verificado+activo sin
    `confirmed` → `needs_confirmation` **y `routeSession.start` nunca se
    llama**; verificado+activo+`confirmed` → `ok` y **`routeSession.start`
    sí se llama con los datos reales** — la gate de confirmación se probó
    explícitamente, no se asumió.
  - `set_driving_mode`: sin vehículo registrado → `denied`, no cambia
    nada; con vehículo registrado → `ok`, sí cambia.
- **Límite honesto:** no se probó el camino HTTP autenticado de punta a
  punta (`POST /assistant/tools/:toolName/execute` con un JWT real) ni,
  por supuesto, ninguna integración Realtime/STT — no existe todavía. Lo
  verificado cubre el grafo de módulos completo y la lógica de negocio de
  cada tool de forma aislada y honesta sobre qué se probó en cada capa.

## Referencias

- `.claude/skills/puntos-movilidad-engineering/` (contrato del pipeline Assistant)
- `docs/architecture/MISSING_CAPABILITIES.md` (sección "Asistente de voz")
- `docs/decisions/ADR-0010-navigation-google-maps.md`, `ADR-0014-vehicle-registration-and-driving-mode.md`, `ADR-0015-location-reminders.md` (servicios reutilizados)
- `backend/src/modules/assistant/`
