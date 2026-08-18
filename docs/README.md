# docs/ — índice

Documentación profunda del proyecto (Nivel 3 de contexto, según `CLAUDE.md` §12).
No hace falta cargar todo esto en cada tarea — la Skill
(`.claude/skills/puntos-movilidad-engineering/SKILL.md`) indica qué 1-2 referencias
leer según el tipo de tarea.

## Qué hay en cada carpeta ahora mismo

- `product/` — visión y alcance de producto.
  - `Ficha-04-CoPiloto.md`: ficha original de CoPiloto (asistente de voz para
    motociclistas → pivote a app de mensajería propia).
  - `01_VISION_Y_CONTEXTO.md`: visión consolidada de la plataforma completa
    (Messaging + Assistant + Location + Navigation + Mobility + Emergency +
    Simulation + Traffic Intelligence).
- `architecture/` — especificaciones técnicas.
  - `02_DOCUMENTO_MAESTRO_CLAUDE_CODE.md`: especificación principal de arquitectura.
  - `Orden-Frontend-Lovable-CoPiloto.md`: spec pantalla por pantalla del front-end
    construido en Lovable (Fase 1 y Fase 2), con su propio historial de decisiones.
  - `Especificacion-Backend-Supabase-CoPiloto.md`: esquema de base de datos, auth,
    storage y RLS propuestos para el backend real (Supabase).
- `operations/` — guías operativas.
  - `03_HERRAMIENTAS_URLS_Y_REFERENCIAS.md`: URLs y docs oficiales de proveedores.
  - `05_CHECKLIST_INICIAL_CLAUDE.md`: checklist de primera sesión sobre el repo.
- `decisions/` — historial de decisiones de alto nivel (`README.md`) y
  `04_ROADMAP_Y_ALCANCE.md` (roadmap por etapas).
- `api/`, `security/`, `realtime/`, `geospatial/`, `voice/`, `simulation/`,
  `testing/` — aún sin contenido propio; cada una tiene un `README.md` que apunta a
  dónde vive lo poco ya definido y qué falta.

## Arquitectura resumida

- Modular monolith.
- NestJS + TypeScript.
- PostgreSQL + PostGIS.
- Redis.
- BullMQ.
- WebSockets.
- FCM + APNs.
- Google Maps Platform mediante adapters.
- OpenAI Realtime para voz.
- Tool Calling.
- Sentry + OpenTelemetry.
- Simulation Engine.

## Primer MVP (objetivo de plataforma completa)

MESSAGING + VOICE ASSISTANT + LOCATION + NAVIGATION + LOCATION REMINDERS +
EMERGENCY CORRIDOR + SIMULATION

**Estado real hoy:** solo MESSAGING tiene avance concreto (front-end visual completo
en Lovable, Fase 1+2, con datos simulados; backend aún no construido). El resto de
dominios están documentados como visión, no como trabajo iniciado.

## Visión de evolución

MVP → Mobility Intelligence → Traffic Prediction → Emergency Coordination →
Signal Priority → Smart Urban Mobility

## Orden recomendado para trabajar

1. `CLAUDE.md` (reglas globales).
2. Identificar el tipo de tarea.
3. `.claude/skills/puntos-movilidad-engineering/SKILL.md` → router de trabajo.
4. Leer solo la(s) referencia(s) necesaria(s) de la Skill.
5. Leer solo el/los documento(s) de `docs/` relevantes (tabla de arriba).
6. Auditar código dirigido antes de implementar.
7. Implementar, verificar, y actualizar `docs/decisions/` solo si cambió algo
   arquitectónico.
