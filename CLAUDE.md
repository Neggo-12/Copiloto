# CLAUDE.md — Reglas globales del repositorio

## 1. Propósito del repositorio

Este repositorio contiene una plataforma unificada de:

**Messaging → Assistant → Location → Navigation → Mobility → Emergency → Simulation → Traffic Intelligence**

La plataforma existente de mensajería es parte del producto y debe preservarse.

## 2. Regla principal

Antes de cambiar código:

1. entiende el área afectada;
2. reutiliza lo existente;
3. cambia la superficie mínima necesaria;
4. prueba el cambio;
5. actualiza documentación solo cuando corresponda.

Orden obligatorio:

**REUSE > EXTEND > REFACTOR > REPLACE**

Nunca reconstruyas el proyecto completo sin evidencia técnica y una decisión documentada.

## 3. Arquitectura global

La arquitectura objetivo es un **modular monolith**.

Componentes de referencia:

- Node.js + TypeScript
- NestJS
- PostgreSQL
- PostGIS
- Drizzle ORM si ya está adoptado
- Redis
- BullMQ
- WebSockets
- FCM/APNs
- Google Maps mediante adapters
- OpenAI Realtime/LLM mediante adapters
- S3-compatible object storage o el storage ya adoptado
- Sentry/OpenTelemetry

No introducir microservicios, Kafka, Kubernetes o service mesh para el MVP salvo una necesidad demostrable.

## 4. Dominios principales

```text
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

Respetar los límites de dominio existentes antes de crear nuevos módulos.

## 5. Regla de IA

La IA **interpreta y decide qué herramienta solicitar**.

La aplicación **autoriza, valida y ejecuta**.

Nunca permitir:

```text
LLM → SQL
LLM → Redis
LLM → secrets
LLM → proveedores sensibles sin adapter/policy
```

Flujo esperado:

```text
Voice/Text → Intent/Tool → Authorization → Application Service → Domain → Result
```

## 6. Privacidad de voz

La aplicación no debe escuchar continuamente en segundo plano.

Modo de uso previsto:

```text
App abierta
→ Modo conducción
→ permisos
→ sesión de voz
→ VAD
→ usuario habla
→ Realtime
```

No implementar wake word permanente ni microphone listener permanente salvo una decisión específica de plataforma documentada.

## 7. Ubicación

La ubicación se activa de forma contextual y con permiso del usuario.

Preferir ubicación foreground/while-in-use para el MVP.

No añadir background location por conveniencia.

Redis representa estado caliente; PostgreSQL/PostGIS representa persistencia/histórico según política de retención.

## 8. Seguridad

Siempre aplicar:

- autenticación;
- autorización;
- validación de entrada;
- rate limiting cuando aplique;
- idempotencia para escrituras/eventos críticos;
- auditoría para acciones sensibles;
- protección de secretos;
- mínimo privilegio.

Las emergencias solo pueden ser activadas por identidades/vehículos autorizados.

## 9. Proveedores externos

No distribuir llamadas directas a proveedores por todo el código.

Usar adapters/interfaces para:

- routing;
- geocoding;
- places;
- navigation;
- voice/AI;
- notifications;
- storage.

Cuando una API o SDK sea sensible a cambios, consultar documentación oficial antes de modificar integración.

## 10. Eficiencia del agente

No leer todo el repositorio repetidamente.

Preferir:

```text
buscar símbolo → leer archivo relevante → leer test/contrato → modificar → verificar
```

Evitar:

```text
leer todo → volver a leer todo → cambiar muchas cosas → descubrir errores tarde
```

No repetir un comando fallido sin corregir la causa.

Minimizar:

- archivos leídos;
- tool calls;
- reintentos;
- cambios no relacionados;
- consultas externas;
- tokens de contexto.

## 11. Skills

La Skill especializada del proyecto está en:

```text
.claude/skills/puntos-movilidad-engineering/SKILL.md
```

Usa esa Skill cuando la tarea corresponda a:

- arquitectura;
- Messaging;
- Assistant/Voice;
- Location/Maps;
- Navigation;
- Location Reminders;
- Emergency Corridor;
- Mobility;
- Traffic;
- Simulation;
- testing de estos dominios;
- integración de proveedores relacionados.

El `CLAUDE.md` define las reglas globales.

La Skill define **cómo ejecutar tareas especializadas** y qué referencias cargar.

No dupliques en `CLAUDE.md` toda la documentación de las Skills.

## 12. Documentación del proyecto

La documentación profunda vive en:

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

Si una respuesta depende de un detalle del proyecto, busca primero en `docs/` antes de inventarlo.

## 13. Definition of Done

Una tarea no está terminada por compilar.

Verifica, según riesgo:

- comportamiento;
- tests;
- lint;
- typecheck;
- build;
- E2E/simulación para flujos críticos;
- permisos y seguridad;
- documentación/ADR si cambió arquitectura.

## 14. Respuesta final de cada tarea

Mantén la salida compacta:

1. qué cambió;
2. qué verificaste;
3. riesgos o bloqueos reales.

No repitas la arquitectura completa salvo que haya cambiado.
