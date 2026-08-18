# Roadmap maestro de desarrollo
## Alcance, etapas y criterios de salida

---

# Etapa 0 — Auditoría del proyecto existente

## Objetivo

Entender exactamente qué ya existe.

## Claude debe revisar

- frontend/mobile;
- backend;
- DB;
- auth;
- users;
- contacts;
- messages;
- media;
- WebSockets;
- push;
- voice;
- maps;
- CI/CD;
- tests.

## Entregables

```text
AUDIT_REPORT.md
CURRENT_ARCHITECTURE.md
REUSE_MATRIX.md
RISK_REGISTER.md
```

## No implementar todavía

No iniciar el módulo nuevo antes de saber qué se reutiliza.

---

# Etapa 1 — Core Foundation

## Objetivo

Preparar una base sólida sin romper mensajería.

## Alcance

- configuración;
- secrets;
- device registry;
- authorization;
- permissions;
- Redis;
- observability;
- realtime;
- error handling;
- audit.

## Salida

Core estable y testeado.

---

# Etapa 2 — Mensajería completa

## Objetivo

Llevar el sistema actual a una mensajería usable de extremo a extremo.

## Alcance

### Texto

- envío;
- entrega;
- lectura;
- reintento;
- idempotencia.

### Multimedia

- imágenes;
- audio;
- video;
- documentos.

### UX

- typing;
- presence;
- reconnect;
- offline queue;
- read receipts.

### Notificaciones

- FCM;
- APNs.

### Seguridad

- rate limit;
- device auth;
- report/block.

## Salida

Dos usuarios pueden comunicarse de forma estable incluso con cambios de red razonables.

---

# Etapa 3 — Asistente

## Objetivo

Convertir la voz en una interfaz operativa.

## Alcance inicial

```text
read_message
send_message
search_message
create_reminder
create_location_reminder
search_place
calculate_route
start_navigation
get_eta
activate_emergency
cancel_emergency
```

## Modo de conducción

```text
App abierta
 ↓
Activar conducción
 ↓
Permisos
 ↓
GPS
 ↓
Voice session
 ↓
VAD
 ↓
Realtime
```

No escucha permanente.

## Salida

El usuario puede ejecutar acciones reales usando voz.

---

# Etapa 4 — Navegación y ubicación

## Alcance

- GPS session;
- map;
- current location;
- heading;
- speed;
- destination;
- geocoding;
- Places;
- routing;
- ETA.

## Salida

El asistente puede:

> "Busca esta dirección y llévame allí."

---

# Etapa 5 — Recordatorios por ubicación

## Alcance

```text
location reminder
geocoding
geofence
trigger engine
notification
voice feedback
```

Caso de aceptación:

> "Recuérdame comprar el cargador cuando pase por Laureles."

Al entrar al geofence:

> "Recuerda comprar el cargador."

Debe funcionar sin intervención manual adicional una vez creado el recordatorio, siempre respetando las capacidades/permisos de ubicación soportados por la plataforma.

---

# Etapa 6 — Emergency Corridor

## Alcance

### Ambulancia verificada

- vehículo;
- conductor;
- permiso;
- emergencia.

### Activación

- botón;
- voz.

### Ruta

- Google Routes.

### Tracking

- GPS.

### Geospatial

- route geometry;
- corridor.

### Conflict

- candidate drivers;
- heading;
- distance;
- ETA;
- Time-To-Conflict.

### Alerts

Automóvil:

visual + audio.

Moto:

voz prioritaria.

### Finalización

- completed;
- cancelled;
- expired.

---

# Etapa 7 — Simulador

## Objetivo

No lanzar a usuarios antes de probar escenarios difíciles.

## Escenarios mínimos

1. Una ambulancia / 10 vehículos.
2. Una ambulancia / 100 vehículos.
3. Tres ambulancias simultáneas.
4. Vehículo fuera de ruta.
5. GPS con ruido.
6. GPS atrasado.
7. Usuario sin conexión.
8. WebSocket reconnect.
9. Ambulancia cancelada.
10. Ambulancia terminada.
11. Conductor entra/sale del corredor.
12. Dos corredores se cruzan.

## Métricas

- latency;
- alerts;
- false positives;
- missed conflicts;
- recovery time.

---

# Etapa 8 — Hardening

## Seguridad

- penetration-oriented tests;
- auth;
- WebSocket security;
- emergency authorization;
- location privacy.

## Rendimiento

- load tests;
- Redis tuning;
- DB indexes;
- PostGIS optimization;
- WebSocket scaling.

## Mobile

- battery;
- network loss;
- permission changes;
- app lifecycle.

---

# Etapa 9 — Piloto controlado

Primero:

```text
1 ambulancia simulada
5–10 conductores
```

Después:

```text
1–3 ambulancias
30–50 conductores
```

Después:

```text
5–10 ambulancias
100–500 conductores
```

No saltar directamente a una ciudad completa.

---

# Etapa 10 — Mobility Intelligence

## Vehículos pesados

Permitir:

- vehículo;
- ruta;
- fecha;
- hora;
- duración;
- tipo;
- evento.

## Primera versión

No hacer IA predictiva compleja.

Comenzar con:

- reglas;
- historial;
- conteo de eventos;
- zonas afectadas.

Después incorporar modelos predictivos.

---

# Etapa 11 — Traffic Prediction

## Datos

- GPS agregado/anónimo según política;
- velocidad;
- segmentos;
- hora;
- día;
- eventos;
- vehículos pesados;
- incidentes.

## Salida

```text
Traffic Risk Score
```

Ejemplo:

```text
Autopista Sur
06:00–07:00
Riesgo: 78%
```

Siempre mostrar como predicción.

---

# Etapa 12 — Signal Priority

## Primero

Simulador de semáforos.

## Después

Priority Decision Engine.

## Finalmente

Integración real con operador/ciudad.

No conectar un algoritmo experimental directamente a infraestructura urbana.

---

# Criterios para avanzar

No avanzar de etapa por calendario.

Avanzar cuando se cumpla:

```text
functional
+
tested
+
observable
+
secure
+
documented
+
simulated where applicable
```

---

# MVP REAL

El primer producto lanzable debe ser:

```text
MESSAGING
+
VOICE ASSISTANT
+
LOCATION
+
NAVIGATION
+
LOCATION REMINDERS
+
EMERGENCY CORRIDOR
+
SIMULATION
```

Esto ya constituye un producto con valor propio.

---

# Funciones de IA alcanzables después del MVP

1. Resumen inteligente de conversaciones.
2. Priorización de mensajes.
3. Respuestas sugeridas.
4. Briefing diario.
5. Recordatorios contextuales.
6. Recomendaciones de ruta.
7. Riesgo de tráfico.
8. Predicción de congestión.
9. Detección de anomalías en emergencias.
10. Agente para administración/operaciones.
11. Generación automática de escenarios de prueba.
12. Copiloto de desarrollo y QA.

---

# Funciones deliberadamente fuera del primer MVP

- escucha permanente;
- wake word de fondo obligatoria;
- E2EE estilo WhatsApp completo;
- control real de semáforos;
- IA autónoma que cambia rutas críticas sin autorización;
- microservicios;
- Kafka;
- Kubernetes;
- infraestructura urbana real.
