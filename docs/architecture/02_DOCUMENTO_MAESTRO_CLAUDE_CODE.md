# DOCUMENTO MAESTRO PARA CLAUDE CODE
## Plataforma de Mensajería + Asistente + Movilidad Inteligente

**Rol del agente:** Principal Software Architect + Staff Engineer + AI Agent Engineer + Geospatial Engineer + Security Engineer + QA + DevOps.

**Objetivo:** convertir el repositorio existente en un producto integrado sin reconstruir lo que ya funciona.

---

# 0. INSTRUCCIÓN SUPREMA

ANTES DE ESCRIBIR CÓDIGO:

1. Inspecciona todo el repositorio.
2. Identifica arquitectura actual.
3. Identifica mobile/frontend.
4. Identifica backend.
5. Identifica DB.
6. Identifica autenticación.
7. Identifica WebSockets.
8. Identifica notificaciones.
9. Identifica media storage.
10. Identifica voz existente.
11. Identifica mapas existentes.
12. Ejecuta tests existentes.
13. Ejecuta lint/typecheck/build.
14. Produce un diagnóstico.

NO reconstruyas el proyecto desde cero.

Usa esta prioridad:

```text
REUSE > EXTEND > REFACTOR > REPLACE
```

Solo reemplaza una pieza existente cuando esté técnicamente justificado y documentado.

---

# 1. STACK BASE

Mantener el stack existente salvo que exista una razón técnica fuerte.

Backend:

- Node.js LTS
- TypeScript
- NestJS
- CommonJS si ese es el módulo actual del repositorio
- Drizzle ORM
- PostgreSQL
- PostgreSQL + PostGIS

Realtime:

- WebSockets
- reutilizar infraestructura existente

Estado caliente:

- Redis

Jobs:

- BullMQ

Media:

- almacenamiento S3-compatible o solución ya existente

Push:

- FCM
- APNs para iOS

Maps:

- Google Maps Platform mediante adapters

Observabilidad:

- Sentry
- OpenTelemetry

IA:

- OpenAI Realtime para sesión de voz
- modelos apropiados para razonamiento/texto
- Tool Calling

---

# 2. ARQUITECTURA

Implementar un MONOLITO MODULAR.

No introducir microservicios, Kafka, Kubernetes ni service mesh en el MVP.

Estructura objetivo:

```text
apps/
  api/
  mobile/

packages/
  shared/
  contracts/
  ui/
  config/

apps/api/src/
  modules/
    identity/
    users/
    devices/
    contacts/
    messaging/
    media/
    notifications/
    assistant/
    reminders/
    location/
    maps/
    navigation/
    emergency/
    mobility/
    traffic/
    audit/
    simulation/
```

Adaptar nombres a la estructura actual si el repositorio ya usa otra convención.

---

# 3. CAPAS DEL BACKEND

Cada módulo debe distinguir:

```text
presentation/
application/
domain/
infrastructure/
```

No poner lógica de negocio crítica dentro de controllers o componentes UI.

Ejemplo:

```text
emergency/
  presentation/
  application/
  domain/
  infrastructure/
```

---

# 4. REGLA DE IA

La IA NO ejecuta acciones directamente.

La IA solamente:

- entiende voz/texto;
- identifica intención;
- selecciona herramienta;
- proporciona argumentos;
- recibe resultado;
- formula respuesta.

El backend:

- autentica;
- autoriza;
- valida;
- ejecuta;
- registra;
- devuelve resultado.

Flujo:

```text
Voice
 ↓
Realtime
 ↓
Tool Call
 ↓
Assistant Application Layer
 ↓
Authorization
 ↓
Domain Service
 ↓
Repository / External Provider
 ↓
Result
 ↓
Assistant
 ↓
Voice
```

---

# 5. TOOL REGISTRY

Crear un registro central de tools.

Ejemplo:

```text
Messaging:
- read_message
- read_unread_messages
- send_message
- reply_message
- search_messages
- summarize_conversation

Reminders:
- create_reminder
- create_location_reminder
- list_reminders
- cancel_reminder

Navigation:
- search_place
- calculate_route
- start_navigation
- stop_navigation
- get_eta

Mobility:
- get_traffic_status
- get_mobility_alerts
- get_route_risk

Emergency:
- activate_emergency
- cancel_emergency
- complete_emergency
- get_emergency_status
```

Cada tool debe tener:

- nombre;
- descripción;
- JSON schema;
- permisos requeridos;
- si requiere confirmación;
- handler;
- logging/audit policy.

---

# 6. CONFIRMATION ENGINE

Definir riesgo de herramientas:

```text
LOW
MEDIUM
HIGH
CRITICAL
```

Ejemplos:

LOW:
- leer mensaje;
- consultar ETA.

MEDIUM:
- crear recordatorio.

HIGH:
- enviar mensaje;
- compartir ubicación.

CRITICAL:
- activar emergencia.

La política debe poder configurarse.

No asumir que toda acción de IA puede ejecutarse automáticamente.

---

# 7. MODELO DE VOZ

No escuchar continuamente en background.

Modo correcto:

```text
App abierta
 ↓
Usuario entra a Modo conducción
 ↓
Permiso ubicación
 ↓
Sesión de voz
 ↓
VAD
 ↓
Habla
 ↓
Realtime
```

Al salir de Modo conducción:

```text
Realtime session = CLOSED
```

No mantener micrófono activo.

---

# 8. UBICACIÓN

La app debe:

1. comprobar estado de permisos;
2. comprobar que servicios de ubicación estén activos;
3. solicitar permiso en contexto;
4. informar al usuario por qué se necesita;
5. iniciar tracking solo cuando corresponde;
6. permitir detener tracking.

Para iOS priorizar autorización While In Use para las funciones del MVP. Apple establece que la solicitud debe hacerse desde foreground y recomienda solicitarla cuando la función que necesita ubicación está siendo usada.

Para Android manejar explícitamente:

- approximate;
- precise;
- foreground;
- background solo si una futura funcionalidad realmente lo requiere.

NO agregar background location por comodidad.

---

# 9. LOCATION SERVICE

Crear:

```text
LocationService
LocationGateway
LocationNormalizer
LocationPermissionService
LocationHistoryService
```

Cada actualización debe contener:

- deviceId;
- userId;
- timestamp;
- latitude;
- longitude;
- accuracy;
- speed;
- heading;
- altitude opcional;
- sessionId.

Validar:

- timestamp;
- precisión;
- velocidad;
- saltos imposibles;
- usuario autenticado;
- dispositivo autorizado.

---

# 10. REDIS

Usar Redis para:

- ubicación actual;
- presencia;
- sesiones;
- candidatos cercanos;
- estado de emergencias;
- rate limiting;
- pub/sub si es necesario;
- jobs de BullMQ.

No usar Redis como base de datos histórica.

---

# 11. POSTGRESQL + POSTGIS

PostgreSQL es source of truth.

PostGIS se utiliza para:

- puntos;
- líneas;
- polígonos;
- geofences;
- corredores;
- rutas;
- intersecciones;
- consultas espaciales.

Evitar cálculos manuales repetitivos de coordenadas cuando una consulta espacial resuelva correctamente el problema.

---

# 12. GOOGLE MAPS

Crear interfaces:

```text
MapsProvider
RoutingProvider
GeocodingProvider
PlacesProvider
NavigationProvider
```

Crear una implementación inicial:

```text
GoogleMapsProvider
```

Nunca repartir llamadas directas a Google Maps por toda la aplicación.

Centralizar:

- API keys;
- timeouts;
- retries;
- logging;
- cuotas;
- errores;
- caching.

---

# 13. ROUTING

Para una ambulancia:

```text
origin
destination
 ↓
RoutingProvider
 ↓
normalized Route
```

Persistir la ruta normalizada necesaria para el corredor y auditoría.

No recalcular ruta por cada GPS update.

Recalcular solamente cuando:

- la ruta quede invalidada;
- el usuario solicite recalcular;
- la desviación supere un umbral;
- el sistema determine que es necesario.

---

# 14. EMERGENCY DOMAIN

Estados:

```text
CREATED
ACTIVATING
ACTIVE
PAUSED
COMPLETED
CANCELLED
EXPIRED
```

Entidades posibles:

```text
vehicles
emergencies
emergency_routes
emergency_events
emergency_alerts
```

Adaptarlas a las tablas existentes.

---

# 15. VEHICLE TYPES

MVP:

```text
AMBULANCE
CAR
MOTORCYCLE
```

Preparar arquitectura para:

```text
FIRE_TRUCK
POLICE
HEAVY_TRUCK
BUS
OTHER_EMERGENCY
```

---

# 16. AMBULANCE AUTHORIZATION

No permitir que un usuario normal active una emergencia de ambulancia.

Modelo:

```text
User
 ↓
Driver authorization
 ↓
Registered vehicle
 ↓
Emergency permission
 ↓
Activation
```

Registrar:

- quién;
- vehículo;
- dispositivo;
- hora;
- origen;
- destino;
- cambios;
- cancelación;
- finalización.

---

# 17. EMERGENCY CORRIDOR ENGINE

Responsabilidad:

```text
route
+
current position
+
speed
+
heading
+
config
=
dynamic corridor
```

Proceso:

```text
Route
 ↓
Segments
 ↓
Dynamic Buffer
 ↓
Corridor
```

No usar solamente un radio circular.

---

# 18. CONFLICT ENGINE

Input:

- ambulance location;
- route;
- speed;
- heading;
- driver location;
- driver speed;
- driver heading;
- route segment;
- ETA;
- distance.

Output:

```text
NO_CONFLICT
POTENTIAL_CONFLICT
ACTIVE_CONFLICT
PASSED
```

Debe calcular un concepto de Time-To-Conflict.

Thresholds en configuración:

```text
PRE_ALERT_THRESHOLD
WARNING_THRESHOLD
CRITICAL_THRESHOLD
```

No esconder parámetros críticos en código.

---

# 19. ALERT ENGINE

Estados:

```text
CREATED
SENT
DELIVERED
ACKNOWLEDGED
RESOLVED
EXPIRED
```

No mandar un push en cada GPS update.

Aplicar:

- deduplicación;
- cooldown;
- escalation;
- expiration;
- state transitions.

---

# 20. EXPERIENCIA DE AUTOMÓVIL

Alerta visual prioritaria:

```text
EMERGENCIA
Ambulancia aproximándose
Facilite el paso cuando sea seguro.
```

Audio opcional/prioritario según estado.

---

# 21. EXPERIENCIA DE MOTO

Priorizar voz:

```text
Atención. Ambulancia aproximándose.
Facilite el paso cuando sea seguro.
```

Al pasar:

```text
La ambulancia ya pasó.
```

---

# 22. PUSH

App abierta:

```text
WebSocket
```

App en background/cerrada:

```text
FCM / APNs
```

No crear un tercer sistema de notificación.

---

# 23. MESSAGING

El servidor es source of truth.

Cada mensaje debe tener:

```text
messageId
clientMessageId
conversationId
senderId
createdAt
serverTimestamp
status
```

Implementar idempotencia.

Estados:

```text
SENT
DELIVERED
READ
```

---

# 24. MEDIA

No pasar grandes archivos por la ruta normal del API si puede evitarse.

Preferir:

```text
Create Upload Session
 ↓
Signed URL
 ↓
Object Storage
 ↓
Finalize Upload
 ↓
Message
```

Registrar:

- mediaId;
- owner;
- mime;
- size;
- checksum;
- storage key;
- createdAt.

---

# 25. REMINDERS

Tablas/entidades deben permitir:

```text
TIME_REMINDER
LOCATION_REMINDER
```

Location Reminder:

```text
place
latitude
longitude
radius
triggerMode
status
```

Flujo:

```text
Usuario
 ↓
Voice
 ↓
create_location_reminder
 ↓
Place/Geocode
 ↓
Geofence
 ↓
Location Engine
 ↓
Trigger
 ↓
Assistant / Push
```

Ejemplo esperado:

> "Recuérdame comprar el cargador cuando pase por Laureles."

---

# 26. SIMULATION ENGINE

Debe existir en el MVP.

Entidades:

```text
Simulation
VirtualVehicle
VirtualRoute
SimulationEvent
SimulationStep
```

Debe permitir reproducir:

- una ambulancia;
- varios conductores;
- rutas;
- cambios de velocidad;
- conflictos;
- desviaciones;
- entrada/salida de corredor.

El simulador debe ser determinista cuando se suministre un seed.

---

# 27. TESTING

Unit:

- corridor;
- conflict;
- ETA;
- thresholds;
- geofence;
- assistant tools;
- permissions.

Integration:

- DB;
- Redis;
- WebSocket;
- routing adapter;
- push;
- reminder jobs.

E2E:

```text
Ambulance activate
 ↓
route
 ↓
GPS updates
 ↓
corridor
 ↓
driver detected
 ↓
alert
 ↓
driver receives
 ↓
ambulance passes
 ↓
alert resolved
```

Simulation tests:

- 1 ambulance / 10 cars;
- 3 ambulances / 100 cars;
- route divergence;
- GPS noise;
- stale locations;
- false positives.

---

# 28. OBSERVABILITY

Agregar:

- Sentry;
- OpenTelemetry;
- structured logs;
- correlationId;
- emergencyId;
- requestId;
- latency metrics.

Medir:

```text
voice_latency
tool_latency
message_delivery_latency
gps_ingestion_latency
corridor_calculation_latency
conflict_detection_latency
alert_delivery_latency
```

---

# 29. SECURITY

Aplicar:

- JWT/session system existente;
- RBAC;
- device binding;
- rate limiting;
- input validation;
- WebSocket auth;
- idempotency;
- audit logs;
- secret management;
- HTTPS/TLS;
- privacy controls.

Ubicación y emergencia requieren controles de acceso estrictos.

---

# 30. DOCUMENTACIÓN OBLIGATORIA

El agente debe mantener:

```text
docs/
  product/
  architecture/
  api/
  security/
  realtime/
  geospatial/
  voice/
  simulation/
  testing/
  operations/
  decisions/
```

Cada decisión arquitectónica importante debe quedar en ADR:

```text
ADR-0001-modular-monolith.md
ADR-0002-postgis.md
ADR-0003-voice-runtime.md
ADR-0004-maps-provider.md
ADR-0005-realtime.md
ADR-0006-location-privacy.md
```

---

# 31. FASES DE IMPLEMENTACIÓN

## FASE 0 — AUDITORÍA

No modificar código salvo para diagnóstico.

Entregables:

- audit report;
- architecture map;
- dependency inventory;
- reuse map;
- risk register.

## FASE 1 — CORE

Reforzar:

- identity;
- devices;
- permissions;
- config;
- realtime;
- Redis;
- observability.

## FASE 2 — MESSAGING COMPLETE

Completar mensajería end-to-end:

- text;
- delivery/read;
- media;
- push;
- presence;
- reconnect;
- idempotency;
- tests.

## FASE 3 — ASSISTANT

Implementar:

- voice session;
- VAD;
- Realtime;
- tool registry;
- confirmation engine;
- messaging tools;
- reminders;
- navigation tools.

## FASE 4 — LOCATION + NAVIGATION

Implementar:

- permission UX;
- location session;
- current state;
- route;
- geocoding;
- places;
- navigation abstraction.

## FASE 5 — LOCATION REMINDERS

Implementar:

- geofence;
- location reminder;
- trigger;
- voice notification.

## FASE 6 — EMERGENCY CORRIDOR

Implementar:

- verified ambulance;
- activation;
- route;
- corridor;
- conflict;
- alerts;
- voice.

## FASE 7 — SIMULATION

Implementar:

- virtual vehicles;
- routes;
- emergency simulations;
- stress scenarios;
- deterministic replay.

## FASE 8 — HARDENING

- security;
- performance;
- battery;
- network failure;
- offline/reconnect;
- privacy;
- observability.

## FASE 9 — PILOT

Escenarios controlados.

## FASE 10 — MOBILITY INTELLIGENCE

Después del MVP:

- heavy vehicle events;
- traffic observations;
- historical models;
- route risk;
- congestion prediction.

## FASE 11 — SIGNAL PRIORITY

Solo después de datos y pilotos:

- simulated signals;
- priority decision engine;
- provider adapter;
- city integration.

---

# 32. CRITERIO DE "TERMINADO"

No aceptar:

- "compila";
- "parece funcionar";
- "el endpoint responde".

Una funcionalidad está terminada cuando:

1. código;
2. tests;
3. integración;
4. seguridad;
5. observabilidad;
6. documentación;
7. simulación si aplica;
8. UI funcional;
9. manejo de errores;
10. regresión verificada.

---

# 33. REGLA SOBRE DEPENDENCIAS

Antes de agregar una dependencia:

1. comprobar si el proyecto ya tiene una solución;
2. comprobar Node/TS/NestJS estándar;
3. comprobar si existe una solución open source madura;
4. justificar costo y riesgo;
5. evitar SDKs duplicados.

No agregar infraestructura por moda.

---

# 34. RESULTADO ESPERADO

El resultado final del desarrollo debe ser una sola plataforma capaz de:

- mensajear;
- leer mensajes por voz;
- responder mensajes;
- crear recordatorios;
- crear recordatorios por ubicación;
- buscar lugares;
- navegar;
- activar modo conducción;
- usar voz durante una sesión activa;
- detectar emergencias;
- avisar a conductores;
- simular escenarios;
- medir resultados;
- evolucionar hacia inteligencia de movilidad.

La plataforma debe estar preparada para incorporar posteriormente:

- predicción de tráfico;
- vehículos pesados;
- coordinación de emergencias;
- semáforos;
- infraestructura urbana.

---

# 35. PRIMERA INSTRUCCIÓN DESPUÉS DE RECIBIR ESTE DOCUMENTO

NO IMPLEMENTES TODAVÍA.

Primero audita.

Después presenta:

1. Architecture Map.
2. Current vs Target Architecture.
3. Reuse Matrix.
4. Missing Components.
5. Risks.
6. Roadmap.
7. File-by-file impact.
8. Migration strategy.
9. Test strategy.

Solo después de producir esos artefactos empieza a ejecutar Fase 1.
