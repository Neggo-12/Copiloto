# Checklist de ejecución inicial para Claude Code

Este archivo es una guía operativa para la primera sesión después de entregar la documentación maestra.

---

# 1. Antes de tocar código

- [ ] Leer todos los archivos `docs/`.
- [ ] Inspeccionar repositorio completo.
- [ ] Identificar lenguaje/framework móvil.
- [ ] Identificar Node version.
- [ ] Identificar TypeScript version.
- [ ] Identificar NestJS version.
- [ ] Identificar ORM version.
- [ ] Identificar PostgreSQL.
- [ ] Confirmar si PostGIS está instalado.
- [ ] Confirmar Redis.
- [ ] Confirmar WebSockets.
- [ ] Confirmar push.
- [ ] Confirmar storage.
- [ ] Confirmar voz.
- [ ] Confirmar Google Maps.
- [ ] Ejecutar tests.
- [ ] Ejecutar lint.
- [ ] Ejecutar typecheck.
- [ ] Ejecutar build.

---

# 2. Crear diagnóstico

Generar:

```text
docs/architecture/CURRENT_ARCHITECTURE.md
docs/architecture/REUSE_MATRIX.md
docs/architecture/MISSING_CAPABILITIES.md
docs/security/INITIAL_SECURITY_AUDIT.md
docs/operations/DEPENDENCIES.md
```

---

# 3. Clasificar componentes existentes

Para cada componente:

```text
KEEP
EXTEND
REFACTOR
REPLACE
REMOVE
```

Justificar `REPLACE`, `REMOVE`.

---

# 4. No modificar todavía

Antes del diagnóstico no modificar:

- authentication;
- messaging;
- DB schema;
- WebSockets;
- mobile navigation;
- voice.

Salvo fix necesario para ejecutar herramientas de diagnóstico.

---

# 5. Definir ADR

Crear:

```text
ADR-0001-architecture.md
ADR-0002-realtime.md
ADR-0003-postgis.md
ADR-0004-assistant.md
ADR-0005-location-privacy.md
ADR-0006-emergency-corridor.md
ADR-0007-simulation.md
```

---

# 6. Primera demostración técnica

Una vez terminada la auditoría, el primer vertical slice nuevo debe ser:

```text
Modo conducción
 ↓
permission check
 ↓
location session
 ↓
voice session
 ↓
VAD
 ↓
simple tool
 ↓
backend action
 ↓
voice response
```

No empezar por simulación semafórica ni por predicción de tráfico.

---

# 7. Segundo vertical slice

```text
User
 ↓
"Recuérdame comprar cargador cuando pase por Laureles"
 ↓
Voice Tool
 ↓
Places/Geocoding
 ↓
Location Reminder
 ↓
Geofence
 ↓
Trigger
 ↓
Assistant Voice
```

---

# 8. Tercer vertical slice

```text
Authorized Ambulance
 ↓
Activate
 ↓
Route
 ↓
GPS
 ↓
Corridor
 ↓
Driver
 ↓
Conflict
 ↓
Alert
```

---

# 9. Cuarto vertical slice

Simulación completa:

```text
Ambulance
+
virtual drivers
+
route
+
corridor
+
conflict
+
alerts
```

---

# 10. Regla de finalización de cada slice

No avanzar hasta tener:

- [ ] unit tests;
- [ ] integration tests;
- [ ] happy path;
- [ ] error path;
- [ ] network failure;
- [ ] permission denied;
- [ ] retry;
- [ ] logs;
- [ ] metrics;
- [ ] documentation.

---

# 11. Regla de comportamiento de Claude

Cuando una dependencia externa cambie:

1. revisar documentación oficial;
2. confirmar versión;
3. registrar cambio;
4. adaptar adapter;
5. ejecutar regresión.

Nunca asumir que un tutorial de 2024/2025 sigue siendo correcto en 2026.

---

# 12. Regla de cierre

Antes de decir que una etapa está terminada:

```text
git diff
↓
tests
↓
lint
↓
typecheck
↓
build
↓
E2E
↓
simulation
↓
security review
↓
docs update
```

El agente debe poder demostrar qué se construyó y cómo se verificó.
