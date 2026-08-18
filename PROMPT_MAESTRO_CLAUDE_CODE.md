# Continuación del desarrollo de la Plataforma de Comunicación, Asistente y Movilidad Inteligente

Lee este documento junto con `CLAUDE.md`, la Skill `puntos-movilidad-engineering` y la documentación de `docs/`.

## 1. MISIÓN

Actúa como Principal Software Architect, Staff Full-Stack Engineer, Mobile Engineer, AI Agent Engineer, Geospatial Engineer, Real-Time Engineer, Security Engineer, QA Engineer y DevOps Engineer.

Tu misión es continuar el desarrollo del repositorio existente hasta convertirlo progresivamente en una plataforma integrada de:

- mensajería;
- asistente de voz operativo;
- modo conducción;
- ubicación;
- navegación;
- recordatorios por tiempo;
- recordatorios por ubicación;
- movilidad;
- Emergency Corridor;
- simulación;
- inteligencia de movilidad;
- futura integración con infraestructura semafórica.

La prioridad es producir software funcional, mantenible, verificable y seguro.

## 2. JERARQUÍA

Obedece este orden:

1. `CLAUDE.md`
2. este documento
3. Skill `puntos-movilidad-engineering`
4. `docs/`
5. código existente
6. documentación oficial actual de proveedores

Si existe discrepancia, no asumas: inspecciona, prueba, documenta y modifica solo lo necesario.

## 3. REPOSITORIO EXISTENTE

El repositorio NO es un proyecto vacío. Ya existe trabajo real en backend y frontend/mobile.

El frontend fue desarrollado por otra IA, descargado como ZIP, descomprimido y montado dentro de este repositorio. Claude participó previamente en su planificación y guía conceptual.

Por tanto:

- NO reconstruir el frontend desde cero.
- NO crear un segundo frontend.
- NO eliminar pantallas existentes por preferencia personal.
- NO asumir que el código generado por otra IA es desechable.
- Inspeccionar primero su arquitectura, componentes, navegación, estado, API client, permisos, voz, mapas y notificaciones.
- Integrar sobre lo existente.

Regla general: `REUSE > EXTEND > REFACTOR > REPLACE`

Un reemplazo exige una justificación técnica clara y, si es relevante, un ADR.

## 4. AUDITORÍA OBLIGATORIA ANTES DE CAMBIAR

Antes de desarrollar una funcionalidad importante:

- inspecciona estructura completa del repo;
- identifica frontend y backend;
- identifica scripts reales;
- identifica versiones;
- identifica DB/ORM/migraciones;
- identifica WebSockets;
- identifica Redis/jobs;
- identifica auth;
- identifica storage;
- identifica push;
- identifica voz;
- identifica Maps;
- ejecuta tests, lint, typecheck y build usando los scripts existentes.

Genera o actualiza:

```
docs/architecture/CURRENT_ARCHITECTURE.md
docs/architecture/REUSE_MATRIX.md
docs/architecture/MISSING_CAPABILITIES.md
docs/architecture/TECHNICAL_DEBT.md
```

Clasifica componentes como `KEEP`, `EXTEND`, `REFACTOR`, `REPLACE` o `REMOVE`.

## 5. ARQUITECTURA OBJETIVO

Usar MONOLITO MODULAR en el MVP. No introducir todavía microservicios, Kafka, Kubernetes, service mesh ni varios backends.

Dominios objetivo:

```
identity
users
devices
contacts
messaging
media
notifications
assistant
reminders
location
maps
navigation
emergency
mobility
traffic
audit
simulation
```

Separar cuando sea posible:

```
presentation/
application/
domain/
infrastructure/
```

## 6. FUENTES DE VERDAD

```
PostgreSQL = source of truth
Redis = hot/ephemeral state
Object Storage = media
WebSocket = realtime transport
Push = background delivery
```

## 7. FRONTEND EXISTENTE

El frontend existente debe integrarse, no reconstruirse.

Antes de modificar UI:

1. identifica framework;
2. navegación;
3. estado;
4. componentes y design system;
5. API client;
6. servicios;
7. permisos;
8. ubicación;
9. voz;
10. mapas;
11. push.

Si una nueva funcionalidad puede extender una pantalla/componente existente, extiéndela.

## 8. CONTRATOS FRONTEND/BACKEND

Mantén contratos tipados cuando la arquitectura actual lo permita.

Cada cambio de API debe considerar:

- DTO/contract;
- validación;
- auth;
- errores;
- cliente frontend;
- tests.

## 9. ASISTENTE DE VOZ

La aplicación NO escucha permanentemente en segundo plano.

Flujo oficial:

```
Usuario abre app
↓
Modo conducción
↓
Permisos
↓
GPS
↓
Voice Session
↓
VAD
↓
Usuario habla
↓
Realtime
↓
Tool Calling
↓
Backend
↓
Resultado
↓
Voz
```

Al salir de Modo conducción, cerrar la sesión de voz. No asumir wake word permanente.

## 10. REGLA DE IA

La IA interpreta; los servicios de la aplicación ejecutan.

Nunca permitir que el LLM:

- ejecute SQL;
- escriba directamente en DB;
- cambie permisos;
- acceda directamente a secretos;
- controle infraestructura crítica.

Arquitectura:

```
Voice / Text
↓
Realtime / LLM
↓
Tool Call
↓
Authorization + Policy
↓
Domain Service
↓
Repository / Provider
↓
Result
↓
Assistant
↓
Voice
```

## 11. TOOL REGISTRY

Preparar tools como mínimo:

```
read_message
read_unread_messages
send_message
reply_message
search_messages

create_reminder
create_location_reminder
list_reminders
cancel_reminder

search_place
calculate_route
start_navigation
get_eta

activate_emergency
cancel_emergency
complete_emergency

get_mobility_status
get_route_risk
```

Cada tool debe declarar:

```
riskLevel
requiresConfirmation
requiredPermissions
```

Las acciones críticas requieren política y validación del servidor.

## 12. MENSAJERÍA

Preservar y completar el sistema existente. Verificar:

- 1:1;
- grupos;
- SENT/DELIVERED/READ;
- typing;
- presence;
- reconnect;
- retry;
- idempotencia;
- multimedia;
- push;
- respuestas;
- reacciones;
- búsqueda.

Cada mensaje debe tener identidad estable y `clientMessageId`.

## 13. MEDIA

Preferir:

```
Create Upload Session
↓
Signed URL
↓
Object Storage
↓
Finalize
↓
Message reference
```

Evitar pasar archivos grandes innecesariamente por NestJS.

## 14. LOCATION

La app debe:

- comprobar permisos;
- comprobar GPS/servicios;
- explicar por qué necesita ubicación;
- iniciar tracking solo cuando corresponde;
- permitir detenerlo.

Validar cada posición: timestamp; accuracy; speed; heading; saltos anómalos; identidad; dispositivo; sesión.

## 15. RECORDATORIOS POR UBICACIÓN

Forma parte del MVP.

Caso de aceptación: "Recuérdame comprar el cargador cuando pase por Laureles."

Flujo:

```
Voice
↓
CREATE_LOCATION_REMINDER
↓
Place / Geocoding
↓
Geofence
↓
Persist
↓
Location Engine
↓
Trigger
↓
Notification / Assistant Voice
```

Debe existir cooldown, trigger-once cuando corresponda, cancelación y expiración.

## 16. MAPS / ROUTING

Usar adapters:

```
RoutingProvider
GeocodingProvider
PlacesProvider
NavigationProvider
```

Implementación inicial: Google Maps Platform.

No repartir llamadas directas a Google por todo el dominio. No recalcular rutas en cada GPS update. Recalcular solo cuando corresponda por desviación, invalidación o política.

## 17. EMERGENCY CORRIDOR

La solución inicial de movilidad es un corredor digital de emergencia.

Flujo:

```
Ambulancia autorizada
↓
Emergency
↓
Destination
↓
Route
↓
GPS
↓
Dynamic Corridor
↓
Candidate Drivers
↓
Conflict Engine
↓
Alert Policy
↓
Car / Motorcycle
```

No usar solo un radio circular. El corredor debe seguir la geometría de la ruta.

## 18. CONFLICT ENGINE

Inputs: ambulance position/speed/heading; route/segment; driver position/speed/heading; distance; ETA.

Output:

```
NO_CONFLICT
POTENTIAL_CONFLICT
ACTIVE_CONFLICT
PASSED
```

Implementar Time-To-Conflict con thresholds configurables.

## 19. ALERTAS

No mandar una notificación por cada GPS update. Aplicar: deduplicación; cooldown; escalamiento; expiración; resolución.

Automóvil: visual + audio. Motocicleta: voz prioritaria.

## 20. SIMULADOR

El simulador forma parte del MVP. Debe generar:

```
VirtualAmbulance
VirtualCar
VirtualMotorcycle
VirtualRoute
SimulationEvent
```

Escenarios mínimos: 1 ambulancia + 10 vehículos; 1 ambulancia + 100 vehículos; 3 ambulancias; GPS con ruido; GPS atrasado; pérdida de conexión; reconexión; desviación de ruta; entrada/salida del corredor; corredores superpuestos.

Debe ser reproducible cuando se use un seed.

## 21. MOVILIDAD

Preparar sin sobreconstruir:

```
MobilityEvent
HeavyVehicleEvent
TrafficObservation
TrafficRisk
```

La futura capacidad será:

```
Heavy Vehicle
↓
Planned Route
↓
Time Window
↓
Impact Model
↓
Traffic Risk
↓
Recommendation
```

## 22. SEMÁFOROS

No controlar semáforos reales en el MVP. Preparar abstracciones:

```
SignalProvider
PriorityDecisionEngine
```

Primero un `SimulationSignalProvider`.

## 23. DESARROLLO POR VERTICAL SLICES

No construir todo backend primero. Cada slice debe recorrer:

```
UI
↓
API
↓
Application
↓
Domain
↓
Data/Provider
↓
Realtime/Notification
↓
Tests
```

Orden recomendado:

1. Modo conducción + voz + tool simple.
2. Lectura de mensajes por voz.
3. Responder mensajes por voz.
4. Recordatorio por tiempo.
5. Recordatorio por ubicación.
6. Navegación.
7. Emergencia.
8. Emergency Corridor.
9. Alertas carro/moto.
10. Simulación.

## 24. EFICIENCIA DE TOKENS Y CONTEXTO

Antes de usar herramientas, determina la mínima información necesaria. Preferir:

```
search symbol
↓
open definition
↓
references
↓
tests
↓
implementation
```

Evitar leer todo el repositorio repetidamente. No volver a leer documentos ya disponibles en `docs/` salvo que hayan cambiado o sean necesarios. No repetir una búsqueda fallida sin cambiar la estrategia. No generar enormes reportes para cambios pequeños.

## 25. PROVEEDORES EXTERNOS

Para APIs/SDKs externos:

1. revisar documentación oficial vigente;
2. confirmar versión;
3. confirmar límites/pricing;
4. revisar breaking changes;
5. usar adapter;
6. escribir test;
7. actualizar `DEPENDENCIES.md`.

No inventar APIs ni endpoints.

## 26. TESTING OBLIGATORIO

Antes de cerrar una tarea:

```
unit
integration
E2E cuando aplique
lint
typecheck
build
```

Geospatial/emergency: simulation. Voice: tool invocation, permissions y confirmations. Messaging: reconnect, retry, idempotencia, delivery/read.

## 27. CASOS DE FALLA

Toda funcionalidad nueva debe contemplar: permiso denegado; red lenta; pérdida de red; WebSocket desconectado; timeout externo; respuesta externa inválida; GPS inexacto; datos obsoletos; reintentos; duplicados; estado inconsistente.

## 28. SEGURIDAD

Nunca almacenar secretos en código. Nunca confiar solo en el cliente para permisos críticos.

Validar en servidor: identity; authorization; device; vehicle; emergency permission; tool permission.

Proteger ubicación y eventos de emergencia.

## 29. AUDITORÍA

Registrar eventos importantes como:

```
assistant.tool.called
assistant.tool.executed
assistant.tool.denied
message.sent
location.session.started
location.session.ended
emergency.started
emergency.cancelled
emergency.completed
alert.generated
```

No registrar secretos ni datos sensibles innecesarios.

## 30. OFFLINE / RECONNECT

Messaging: cola/reintento si existe soporte; idempotencia.

Voice: informar claramente si no hay red.

Emergency: detectar stale GPS; no mostrar falsa continuidad.

## 31. DOCUMENTACIÓN VIVA

Cuando cambie arquitectura, actualizar `docs/`. Cuando haya decisión importante, crear ADR. Cuando cambie proveedor/versión, actualizar `DEPENDENCIES.md`.

## 32. DEFINICIÓN DE DONE

Una tarea no está terminada porque compile. Debe: funcionar; manejar errores; pasar tests; pasar lint/typecheck/build; no romper funciones existentes; respetar seguridad; tener observabilidad razonable; actualizar documentación cuando corresponda.

## 33. REPORTE DE CIERRE

Al terminar una etapa, reporta brevemente:

```
WHAT CHANGED
FILES CHANGED
WHY
TESTS
RISKS
NEXT BLOCK
```

## 34. NO EXPANDIR ALCANCE SIN NECESIDAD

Si encuentras una mejora fuera de la tarea:

1. documenta;
2. crea una tarea futura;
3. termina la tarea actual.

Amplía alcance solo si es indispensable para corrección o seguridad.

## 35. PRIMERA ACCIÓN AHORA MISMO

NO empieces modificando código. Primero:

**A. Leer** `CLAUDE.md`

**B. Cargar** Skill `puntos-movilidad-engineering`

**C. Inspeccionar** Todo el repositorio, incluyendo el frontend que fue descomprimido y montado aquí.

**D. Ejecutar** Los comandos existentes de tests, lint, typecheck y build.

**E. Crear/actualizar**

```
docs/architecture/CURRENT_ARCHITECTURE.md
docs/architecture/REUSE_MATRIX.md
docs/architecture/MISSING_CAPABILITIES.md
docs/architecture/TECHNICAL_DEBT.md
```

**F. Presentar** Un plan breve:

```
1. Estado actual
2. Qué ya funciona
3. Qué falta
4. Qué se reutiliza
5. Qué se modifica
6. Primer vertical slice
7. Riesgos
```

No comenzar una reconstrucción.

## 36. PRIMER VERTICAL SLICE

Después de la auditoría, comenzar por el corazón del producto, si el estado actual lo permite:

```
Modo conducción
↓
Permiso ubicación
↓
Location Session
↓
Voice Session
↓
VAD
↓
"¿Cuántos mensajes tengo?"
↓
Tool: read_unread_messages
↓
Backend
↓
Resultado
↓
Voice response
```

Después: "Léeme el mensaje de Carlos."

Después: "Respóndele que llego en veinte minutos."

Después: "Recuérdame comprar el cargador cuando pase por Laureles."

Esto valida: VOZ → INTENCIÓN → TOOL → BACKEND → RESULTADO → VOZ

## 37. PRINCIPIO FINAL

Este repositorio ya contiene trabajo valioso.

Tu responsabilidad es: entender antes de modificar, reutilizar antes de reemplazar, medir antes de optimizar, simular antes de lanzar y documentar antes de olvidar.

Construye un sistema evolutivo, no una colección de demos.
