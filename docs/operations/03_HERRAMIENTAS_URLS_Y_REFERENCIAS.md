# Herramientas, URLs y referencias oficiales
## Guía de integración para Claude Code

**Regla:** usar primero documentación oficial. No inventar APIs, endpoints, SDKs ni parámetros.

---

# 1. OpenAI — Realtime / Voice / Tools

## Sitio general
https://developers.openai.com/

## Modelos
https://developers.openai.com/api/docs/models/all

## Realtime
https://developers.openai.com/api/docs/guides/realtime

## Realtime WebRTC / conexión
https://developers.openai.com/api/docs/guides/realtime

## Tool / Function Calling
https://developers.openai.com/api/docs/guides/function-calling

## Pricing
https://openai.com/api/pricing/

Uso previsto:

- sesión de voz;
- VAD;
- conversación;
- tool calling;
- respuesta hablada;
- agente contextual.

Regla:
- no permitir acceso directo de la IA a DB;
- todas las herramientas pasan por backend;
- separar command mode de conversation mode cuando convenga por costo/latencia.

---

# 2. Google Maps Platform

## Portal
https://developers.google.com/maps

## Routes API
https://developers.google.com/maps/documentation/routes

## Routes REST reference
https://developers.google.com/maps/documentation/routes/reference/rest

Endpoint principal:
https://routes.googleapis.com

## Geocoding
https://developers.google.com/maps/documentation/geocoding

## Places API
https://developers.google.com/maps/documentation/places/web-service

## Navigation SDK — Android
https://developers.google.com/maps/documentation/navigation/android-sdk/overview

## Navigation SDK — iOS
https://developers.google.com/maps/documentation/navigation/ios-sdk/overview

## Pricing
https://developers.google.com/maps/billing-and-pricing/overview

Uso previsto:

- rutas;
- geocoding;
- reverse geocoding;
- Places;
- navegación;
- ETA.

Regla:
crear adapters:

```text
RoutingProvider
GeocodingProvider
PlacesProvider
NavigationProvider
```

Google no debe quedar disperso por el código.

---

# 3. Firebase Cloud Messaging

## Docs
https://firebase.google.com/docs/cloud-messaging

## Getting Started
https://firebase.google.com/docs/cloud-messaging/get-started

Uso:

- push Android;
- push iOS mediante integración correspondiente;
- datos de notificación;
- app reactivable.

No utilizar FCM como reemplazo del WebSocket en tiempo real.

---

# 4. Apple — Location / Core Location

## Solicitar ubicación While In Use
https://developer.apple.com/documentation/corelocation/cllocationmanager/requestwheninuseauthorization()

## Gestión de permisos
https://developer.apple.com/documentation/corelocation/requesting-authorization-to-use-location-services

Uso:

- permisos;
- ubicación mientras app está en uso;
- UX de consentimiento.

Principio:
no solicitar Always sin una necesidad real y justificada.

---

# 5. Android — Location

## Location permissions
https://developer.android.com/develop/sensors-and-location/location/permissions

## Runtime permissions
https://developer.android.com/develop/sensors-and-location/location/permissions/runtime

Uso:

- coarse/fine;
- foreground;
- background solamente si una futura función lo requiere.

MVP:
preferir foreground/while-in-use.

---

# 6. NestJS

## Docs
https://docs.nestjs.com/

## WebSockets
https://docs.nestjs.com/websockets/gateways

## Guards
https://docs.nestjs.com/guards

## Validation
https://docs.nestjs.com/techniques/validation

Uso:

- API;
- WebSocket;
- modular monolith;
- guards;
- validation;
- dependency injection.

---

# 7. PostgreSQL

## Official
https://www.postgresql.org/docs/

Uso:

- source of truth;
- usuarios;
- mensajes;
- emergencias;
- recordatorios;
- auditoría;
- histórico.

---

# 8. PostGIS

## Official documentation
https://postgis.net/documentation/manual/

Uso:

- geospatial;
- route geometry;
- corridor;
- geofence;
- spatial relationships.

---

# 9. Redis

## Official
https://redis.io/docs/

## Geospatial
https://redis.io/docs/latest/develop/data-types/geospatial/

Uso:

- current locations;
- presence;
- sessions;
- nearby users;
- caching;
- realtime state.

---

# 10. BullMQ

## Docs
https://docs.bullmq.io/

## Architecture
https://docs.bullmq.io/guide/architecture

Uso:

- reminder jobs;
- delayed events;
- expiration;
- async work;
- simulation jobs;
- retries.

---

# 11. Sentry

## Docs
https://docs.sentry.io/

## NestJS
https://docs.sentry.io/platforms/javascript/guides/nestjs/

Uso:

- crashes;
- application errors;
- performance;
- debugging.

---

# 12. OpenTelemetry

## JavaScript
https://opentelemetry.io/docs/languages/js/

## Getting Started
https://opentelemetry.io/docs/languages/js/getting-started/

Uso:

- traces;
- metrics;
- correlation;
- latency across services/components.

---

# 13. GitHub

https://github.com/

https://docs.github.com/

Uso:

- repository;
- pull requests;
- issues;
- Actions;
- CI/CD.

---

# 14. GitHub Actions

https://docs.github.com/actions

Pipeline mínimo:

```text
install
 ↓
lint
 ↓
typecheck
 ↓
unit tests
 ↓
integration tests
 ↓
build
 ↓
E2E
```

---

# 15. Regla de investigación para Claude

Cuando una tarea implique una API o SDK externo:

1. leer la documentación oficial;
2. identificar versión/documentación vigente;
3. revisar límites y pricing;
4. buscar breaking changes;
5. revisar ejemplos oficiales;
6. implementar adapter;
7. escribir test;
8. documentar.

No depender de tutoriales viejos si existe documentación oficial actual.

---

# 16. Fuentes externas secundarias

Solo utilizar:

- GitHub oficial;
- repositorios oficiales;
- documentación del proveedor;
- issues oficiales cuando sea necesario.

No basar una decisión arquitectónica crítica en un post aleatorio o tutorial desactualizado.

---

# 17. URLs informativas del dominio futuro

## Seguridad / privacidad

Apple:
https://developer.apple.com/documentation/corelocation

Android:
https://developer.android.com/develop/sensors-and-location

Google Maps:
https://developers.google.com/maps

## Geospatial

PostGIS:
https://postgis.net/

Redis:
https://redis.io/

## Realtime

NestJS:
https://docs.nestjs.com/websockets

## IA

OpenAI:
https://developers.openai.com/

## Push

Firebase:
https://firebase.google.com/docs/cloud-messaging

---

# 18. Costo y control de consumo

Claude debe implementar:

- variables de cuota;
- límites;
- caching;
- request deduplication;
- logging de llamadas externas;
- métricas por proveedor;
- circuit breakers donde corresponda.

Google Maps funciona con pricing basado en uso/SKU y cuotas; no diseñar el sistema suponiendo llamadas infinitas gratuitas.

---

# 19. Variables/Secrets

Nunca incluir:

- OpenAI API key;
- Google Maps API keys privadas;
- Firebase service account;
- DB credentials;
- Redis credentials;

en:

- Git;
- frontend;
- commits;
- logs.

Usar:

```text
.env
.env.example
secret manager
CI secrets
```

según el entorno.

---

# 20. Versioning

Registrar en:

```text
docs/architecture/DEPENDENCIES.md
```

por cada proveedor:

- producto;
- versión;
- fecha de verificación;
- URL oficial;
- uso;
- límites;
- costo;
- riesgos de migración.

---

# 21. Nota importante sobre ubicación

El producto se diseña para que la sesión de conducción y la ubicación se activen de forma explícita.

No asumir acceso permanente en background.

Las capacidades de background location, CarPlay/Android Auto o wake word deben ser tratadas como fases separadas y depender de las reglas actuales de cada plataforma.
