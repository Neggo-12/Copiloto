# ADR-0007 — Introducir backend NestJS ahora (modular monolith)

**Fecha:** 2026-08-18
**Estado:** Aceptado — decisión explícita del fundador.

## Contexto

`docs/architecture/MISSING_CAPABILITIES.md` dejaba abierta una decisión desde la
auditoría inicial: seguir consumiendo Supabase directo desde el front-end
(PostgREST + Realtime + Storage, patrón que ya usa toda la mensajería) o introducir
el backend NestJS que describe `CLAUDE.md` §3 como arquitectura objetivo.

Al arrancar la Fase 1 del cronograma de Emergency Corridor
(`docs/decisions/05_CRONOGRAMA_EMERGENCY_Y_NUEVAS_FUNCIONALIDADES.md`), se le
presentó la decisión al fundador porque Redis/BullMQ y el futuro Conflict Engine
son piezas de cómputo con estado que encajan mal en el patrón "RLS + cliente
directo" que sí funciona bien para CRUD de mensajería. El fundador eligió meter
NestJS ya, en vez de esperar a que la necesidad fuera innegable.

## Decisión

Se crea `backend/` como proyecto NestJS independiente (modular monolith, un solo
deployable), **sin tocar** `proyecto-mensajeria/` — la mensajería sigue consumiendo
Supabase directo tal como está, funcionando. No hay evidencia ni pedido de migrarla;
migrarla ahora violaría la regla de diff mínimo y "no reconstruir sin evidencia".

Primer slice construido (Fase 1 — fundación, no todavía el corredor real):

- `SupabaseModule`: cliente Supabase con la **service role key** (bypassa RLS a
  propósito), inyectable en toda la app. La service role key vive solo en
  `backend/.env` (nunca en git, nunca en el front-end).
- `SupabaseAuthGuard`: valida el JWT de sesión de Supabase Auth que ya usa el
  front-end (mismo mecanismo, ningún sistema de auth nuevo) vía
  `supabase.auth.getUser(token)`. Nunca confía en un `user_id` que venga en el
  body/query — regla global de seguridad.
- `GET /health`: healthcheck simple, sin auth.
- `GET /emergency/vehicles/me`: primer endpoint real, protegido por el guard.
  Devuelve el estado de verificación de ambulancia del usuario autenticado
  (`emergency_vehicles`, ver ADR-0006), usando el cliente admin para decidir
  autorización explícitamente en el backend en vez de depender de RLS del cliente
  — así es como CLAUDE.md §5 define el flujo: `Voice/Text → Intent/Tool →
  Authorization → Application Service → Domain → Result`.

**Redis/BullMQ:** siguen pendientes de un proveedor (Upstash, Redis Cloud,
self-hosted) — es una decisión de cuenta/costo que el fundador debe tomar y
proveer via `REDIS_URL`; el backend arranca sin Redis por ahora y lo exigirá
explícitamente cuando el primer módulo que lo necesite (jobs de recordatorios,
Fase 5/7) se conecte.

## Verificación

- `bun run typecheck`, `bun run lint`, `bun run build`: los tres limpios, 0 errores.
- Arranque real (`node dist/main.js`) con variables de entorno de humo:
  `GET /health` responde `200 {"status":"ok",...}`.
- Arranque sin `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`: falla rápido con un
  mensaje explícito (`Faltan variables de entorno requeridas: ...`), en vez de
  arrancar a medias — regla de "fallar rápido y claro" del proyecto.
- CI (`.github/workflows/ci.yml`) actualizado: job `backend` corre
  lint+typecheck+build en cada push/PR que toque `backend/**`, en paralelo al job
  `frontend` ya existente (antes `lint-typecheck-build`, renombrado). Ningún cambio
  al comportamiento del job de front-end.

## Consecuencias

- Dos deployables desde ahora: `proyecto-mensajeria/` (front-end, Supabase directo)
  y `backend/` (NestJS, service role). Ambos hablan con el mismo proyecto Supabase.
- Los siguientes dominios que se construyan (Location, Navigation, Emergency
  Corridor completo, Mobility, Traffic, Simulation) viven en `backend/src/modules/`,
  siguiendo la lista de dominios de `CLAUDE.md` §4. No se crean carpetas de dominio
  vacías por adelantado — cada módulo se agrega cuando hay trabajo real que
  justifique su existencia (regla de "no complejidad sin evidencia").
- Redis/BullMQ quedan como decisión de proveedor pendiente del fundador, igual que
  en su momento quedó pendiente el proveedor de SMS — no bloquea lo que ya se puede
  construir sin ellos.

## Referencias

- `docs/decisions/05_CRONOGRAMA_EMERGENCY_Y_NUEVAS_FUNCIONALIDADES.md`
- `docs/decisions/ADR-0006-emergency-corridor.md`
- `docs/architecture/MISSING_CAPABILITIES.md`
- `backend/src/app.module.ts`, `backend/src/common/supabase/`, `backend/src/modules/emergency/`
