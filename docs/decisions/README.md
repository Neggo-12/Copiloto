# Decisiones — índice

Historial de decisiones de alto nivel del proyecto. El detalle screen-por-screen del
front-end tiene su propio changelog ("Historial de decisiones") dentro de
`docs/architecture/Orden-Frontend-Lovable-CoPiloto.md`; aquí solo quedan los hitos.

| Fecha | Decisión | Detalle |
|---|---|---|
| 2026-08-12 | Construir una app de mensajería propia (clon funcional de WhatsApp), no orquestar la app real de WhatsApp. | `docs/product/Ficha-04-CoPiloto.md` §11 |
| 2026-08-12 | División en dos frentes: front-end en Lovable (usuario), back-end en Claude (una vez entregado el front). | `docs/architecture/Orden-Frontend-Lovable-CoPiloto.md` |
| 2026-08-12 | Fase front-end con datos 100% simulados/mock, sin Supabase real — reversión explícita por mala experiencia previa de seguridad con Lovable. | `docs/architecture/Orden-Frontend-Lovable-CoPiloto.md` §0 |
| 2026-08-12 | Identidad visual propia (violeta/índigo `#5B4FE5` + ámbar `#F5A623`, sin cola en burbujas, Manrope, Phosphor) para diferenciarse claramente de WhatsApp. | `docs/architecture/Orden-Frontend-Lovable-CoPiloto.md` §6.1 |
| 2026-08-12 | Patentación / protección de propiedad intelectual marcada como prioridad a evaluar antes de escalar o mostrar el producto públicamente. | `docs/product/Ficha-04-CoPiloto.md` §9, punto 6 |
| 2026-08-12/13 | Fase 1 (MVP) y Fase 2 (paridad WhatsApp) del front-end completadas en Lovable. Fase 3 (VoIP real, proximidad) queda en pausa. | `docs/architecture/Orden-Frontend-Lovable-CoPiloto.md` |
| 2026-08-13 | Pasar a la fase de back-end. El usuario crea su propio proyecto de Supabase; el export de Lovable se entrega como zip (`proyecto-mensajeria.zip`, en la raíz del repo, pendiente de inspeccionar y cruzar contra el esquema). | `docs/architecture/Especificacion-Backend-Supabase-CoPiloto.md` |
| 2026-08-18 | Adopción de la estructura de tres niveles (`CLAUDE.md` + `.claude/skills/puntos-movilidad-engineering/` + `docs/`) para todo el proyecto "Puntos Movilidad", del cual CoPiloto (mensajería/asistente) es una parte. Reorganización de archivos existentes hacia esta estructura. | este commit |
| 2026-08-18 | Auditoría inicial del repositorio: front-end real inspeccionado (TanStack Start + React 19), cero backend, patrón de acciones/hooks aislados confirmado como listo para voz. | `docs/architecture/CURRENT_ARCHITECTURE.md`, `REUSE_MATRIX.md`, `MISSING_CAPABILITIES.md`, `TECHNICAL_DEBT.md` |
| 2026-08-18 | Confirmado: el proyecto Supabase "Copiloto" (`wrkuusacwkdazfwynhkz`, `ca-central-1`) ya existe y está activo, sin tablas todavía. Deja de ser un bloqueo para empezar el backend real. | `docs/architecture/MISSING_CAPABILITIES.md` |

## Pendiente de decidir

- Proveedor de SMS/OTP para verificación telefónica en Supabase Auth (Twilio /
  MessageBird / Vonage).
- Cruce de nombres del esquema de `docs/architecture/Especificacion-Backend-Supabase-CoPiloto.md`
  contra el código real exportado en `proyecto-mensajeria/` (ya inspeccionado en la
  auditoría del 18 de agosto; el modelo de `src/lib/domain/types.ts` coincide en general
  con la spec — cruce fino queda para cuando se apliquen las migraciones).
