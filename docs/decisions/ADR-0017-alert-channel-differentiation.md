# ADR-0017 — Alert Policy: canal recomendado por Modo de manejo (cierre de gap de Fase 3)

**Fecha:** 2026-08-19
**Estado:** Aceptado — verificado con Redis real (6/6 casos).

## Contexto

Desde ADR-0013, `AlertPolicyService` mandaba el mismo mensaje a todos los
candidatos porque no existía ningún dato de "en qué vehículo va este
usuario". Ese dato ya existe desde ADR-0014 (`user_vehicles` +
`DrivingModeService`). Este ADR cierra ese gap puntual — no reabre el resto
del alcance original de Fase 3 (buffer dinámico por velocidad, estados
`NO_CONFLICT`/`POTENTIAL_CONFLICT`/`ACTIVE_CONFLICT`/`PASSED` del Conflict
Engine, severidad `INFO`/`WARNING`/`CRITICAL`, cierre de corredor
`completed`/`cancelled`/`expired`), que siguen diferidos a propósito, sin
evidencia de necesidad todavía y sin pedirse en esta conversación.

## Decisión

**Se diferencia el CANAL recomendado, no el texto del mensaje.** El
fundador dio una frase exacta (`BASE_ALERT_MESSAGE`) — inventar redacciones
distintas para carro/moto sin su aprobación habría sido una decisión de
producto que no le corresponde tomar a este backend. Lo que sí cambia:
cada evento `corridor:alert` ahora incluye `recommendedChannel`:

- `"visual_audio"` — candidato en modo carro (`DrivingModeService.get() ===
  "car"`).
- `"voice_priority"` — candidato en modo moto.
- `"default"` — candidato que nunca fijó Modo de manejo (la mayoría de los
  casos hoy, hasta que la app cliente lo pida en onboarding o el asistente
  pregunte — ver ADR-0016). No es un error ni un caso roto.

El cliente (todavía sin construir) decide cómo renderizar cada canal —
este backend solo le dice cuál corresponde, mismo principio de "la IA/el
backend decide QUÉ, el cliente decide CÓMO mostrarlo" ya aplicado en otras
partes del proyecto.

`AlertPolicyService` ahora depende de `DrivingModeService`
(`EmergencyCorridorModule` importa `VehiclesModule`) — sin ciclo, porque
`VehiclesModule` no depende de nada de Emergency Corridor.

## Verificación (real, sin mocks)

- `typecheck`/`lint`/`build`: limpios.
- Smoke test real contra Redis local (6/6 casos): tres candidatos reales
  (uno en modo carro, uno en modo moto, uno sin modo fijado) evaluados con
  `AlertPolicyService` real + `DrivingModeService` real —
  `recommendedChannel` correcto para los tres casos, el texto del mensaje
  sigue siendo idéntico para los tres (no se inventó redacción nueva), y el
  cooldown existente (ADR-0013) sigue funcionando sin cambios en una
  segunda evaluación inmediata.

## Referencias

- `docs/decisions/ADR-0013-alert-policy.md`, `ADR-0014-vehicle-registration-and-driving-mode.md`
- `backend/src/modules/emergency-corridor/alert-policy.service.ts`
