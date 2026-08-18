# MISSING_CAPABILITIES.md

Brecha entre la visión (`PROMPT_MAESTRO_CLAUDE_CODE.md`, `docs/product/`) y lo que
existe hoy en el repositorio. Todo lo listado aquí es **CREAR**, no reutilizar — no hay
código previo para ninguno de estos puntos.

## Backend

**Actualizado 2026-08-18:** la base de datos y el storage YA EXISTEN y están
aplicados sobre el proyecto Supabase "Copiloto" — 13 tablas, RLS en todas, 4 buckets
con políticas (ver `docs/decisions/ADR-0001-esquema-backend.md` y
`supabase/migrations/`). Sigue faltando todo lo demás:

- Proyecto NestJS + estructura modular monolith (`identity/users/devices/contacts/
  messaging/media/notifications/assistant/reminders/location/maps/navigation/
  emergency/mobility/traffic/audit/simulation`) — o, alternativa más simple para el
  MVP: consumir Supabase directamente desde el front-end (PostgREST + Realtime +
  Storage del SDK) sin una capa NestJS intermedia todavía. Es una decisión pendiente,
  no tomada por esta auditoría.
- PostGIS no está habilitado en el proyecto todavía (no hace falta hasta Location/Maps).
- Redis + BullMQ para estado caliente/jobs (recordatorios por tiempo, cooldowns).
- WebSockets/tiempo real: la tabla existe, pero no se activó ninguna suscripción
  Realtime ni se escribió código que la use.
- Auth real: **parcial, 2026-08-18.** Verificación telefónica ya conectada a
  Supabase Auth real (`signInWithOtp`/`verifyOtp`) usando **Test OTP** (números de
  prueba, sin costo) mientras no se decida el proveedor de SMS de producción
  (Twilio/MessageBird/Vonage). Falta: registrar los números de Test OTP en el
  Dashboard de Supabase (paso manual, sin tool de MCP para esto), y el proveedor
  de correo real para el flujo de verificación de email (sigue simulado).
- Vistas de `unreadCount`/`lastMessagePreview` (pendiente del ADR-0001).
- Job/Edge Function de limpieza de `status-media` tras 24h.
- Cliente API en el frontend: **resuelto parcialmente, 2026-08-18.**
  `@supabase/supabase-js` ya está instalado y conectado (`src/lib/supabase/client.ts`,
  con almacenamiento de sesión en memoria — ver nota de seguridad en ese archivo —
  y `src/lib/actions/auth.ts` ya habla con el backend real para OTP). El resto de
  dominios (chats, contactos, notas, estados) siguen 100% en mock-data en memoria.

## Asistente de voz (visión documentada, cero implementación)

- Modo conducción (UI/estado que active la sesión de voz).
- Integración Realtime/STT (OpenAI Realtime u otro adapter).
- Tool registry (`read_message`, `send_message`, `create_reminder`,
  `create_location_reminder`, `calculate_route`, `activate_emergency`, etc.) — ninguna
  tool existe como código; solo como lista en `PROMPT_MAESTRO_CLAUDE_CODE.md` §11.
- Capa de autorización/política entre LLM y servicios de dominio.

## Location / Maps / Navigation

- Permisos y sesión de ubicación foreground.
- Adapters `RoutingProvider`, `GeocodingProvider`, `PlacesProvider`,
  `NavigationProvider` sobre Google Maps Platform.
- Recordatorios por ubicación (geofencing + trigger).
- Recordatorios por tiempo (jobs con BullMQ).

## Emergency Corridor / Mobility / Traffic

- Todo el dominio Emergency (corredor dinámico, Conflict Engine, Alert Policy) —
  0% implementado, solo diseñado conceptualmente en el prompt maestro.
- `MobilityEvent`, `HeavyVehicleEvent`, `TrafficObservation`, `TrafficRisk`.
- Abstracciones `SignalProvider` / `PriorityDecisionEngine` (semáforos) — ni siquiera
  el `SimulationSignalProvider` inicial existe.

## Simulación

- Motor de simulación (`VirtualAmbulance`, `VirtualCar`, `VirtualMotorcycle`,
  `VirtualRoute`, `SimulationEvent`) — no existe código.
- Ningún escenario de prueba (ruido GPS, pérdida de conexión, corredores
  superpuestos, etc.) está implementado.

## Calidad / Verificación

- Sin suite de tests (no hay `vitest`/`jest` en `package.json`, ni carpetas `__tests__`).
- Sin script `typecheck` explícito (hay `tsconfig.json`, pero ningún script lo ejecuta
  de forma aislada — solo se valida implícitamente al hacer `vite build`).
- Sin CI configurado (no se encontró `.github/workflows/` ni equivalente).
- Sin `DEPENDENCIES.md` (requerido por `PROMPT_MAESTRO_CLAUDE_CODE.md` §25).

## Producto / Decisiones abiertas

- Proveedor de SMS/OTP sin decidir (Twilio/MessageBird/Vonage).
- Decisión de patentar/proteger la plataforma, marcada como prioridad, sin resolver.

**Actualizado 2026-08-18 (tarde):** el proyecto Supabase "Copiloto" ya existe
(`wrkuusacwkdazfwynhkz`, región `ca-central-1`, `ACTIVE_HEALTHY`, creado 2026-08-16).
Verificado vía `mcp__Supabase__list_tables` — **0 tablas todavía**, es decir, el
proyecto está creado pero sin esquema aplicado. Ya no es un bloqueo: el siguiente paso
es aplicar el esquema de `docs/architecture/Especificacion-Backend-Supabase-CoPiloto.md`
como migraciones reales.
