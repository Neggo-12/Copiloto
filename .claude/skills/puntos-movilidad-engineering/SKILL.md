---
name: puntos-movilidad-engineering
version: 1.0.0
description: Orquesta el desarrollo de una plataforma de mensajería, asistente de voz y movilidad inteligente. Úsala para implementar, revisar, depurar, probar o planificar Messaging, Voice Assistant, Modo Conducción, Location, Maps, Location Reminders, Emergency Corridor, Simulation y futuras capas Mobility/Traffic.
compatibility: Claude Code dentro de un repositorio TypeScript/Node.js con acceso al terminal, Git y las dependencias del proyecto. Usa documentación oficial para proveedores externos.
metadata:
  author: proyecto-puntos
  project: messaging-voice-mobility
  workflow: audit-first-progressive-disclosure
  architecture: modular-monolith
---

# Puntos Mobility Engineering Skill

## Misión

Construir y mantener el proyecto como una sola plataforma coherente de:

`Messaging → Assistant → Location → Navigation → Mobility → Emergency → Simulation → Traffic Intelligence`

La prioridad es **hacer cambios correctos con el menor número razonable de tokens, archivos, llamadas y reintentos**.

## Reglas no negociables

1. **Audita antes de editar.** No reconstruyas la plataforma existente. Usa `REUSE > EXTEND > REFACTOR > REPLACE`.
2. **No adivines.** Inspecciona el código, esquema, scripts y configuración antes de decidir. Si falta información, busca primero en el repositorio y en documentación oficial.
3. **Plan pequeño, ejecución concreta.** Para tareas normales: inspección dirigida → plan de 3–7 pasos → implementación → validación. No produzcas planes gigantes que no ejecutas.
4. **Una fuente de verdad.** PostgreSQL es persistencia; Redis es estado caliente/realtime; object storage es media.
5. **IA interpreta; backend ejecuta.** El modelo nunca accede directamente a DB, Redis, secretos ni proveedores sensibles.
6. **Modular monolith primero.** No introducir microservicios, Kafka, Kubernetes ni complejidad distribuida sin evidencia de necesidad.
7. **Proveedores detrás de adapters.** Google Maps, OpenAI, FCM/APNs y storage deben estar encapsulados.
8. **Seguridad por defecto.** Ubicación, voz, mensajería y emergencia requieren permisos, autorización, validación, auditoría e idempotencia.
9. **No escuchar en segundo plano continuamente.** Voz solo durante una sesión explícita de Modo conducción/voz activa.
10. **No recalcular ni notificar innecesariamente.** Aplicar caching, deduplicación, throttling y cooldowns.
11. **Prueba antes de declarar terminado.** Como mínimo: tests afectados + lint/typecheck/build; E2E/simulación cuando aplique.
12. **No tocar áreas no relacionadas.** Minimiza el diff y evita refactors oportunistas.

## Router de trabajo

Clasifica cada solicitud en una sola categoría principal:

- `AUDIT`: entender el repositorio o una arquitectura.
- `FEATURE`: construir una capacidad nueva.
- `BUG`: reproducir, aislar y corregir.
- `REFACTOR`: mejorar estructura sin cambiar comportamiento.
- `SECURITY`: revisar permisos, datos, secretos o superficies sensibles.
- `TEST`: crear/mejorar pruebas o simulaciones.
- `PERFORMANCE`: reducir latencia, consumo, consultas o costo.
- `PROVIDER`: integrar/actualizar OpenAI, Google, FCM/APNs u otro proveedor.
- `REVIEW`: revisar diff o etapa terminada.

Lee solamente la referencia necesaria:

| Categoría | Referencia |
|---|---|
| Arquitectura general | `references/architecture.md` |
| Producto y alcance | `references/product-scope.md` |
| Voice/AI | `references/voice-assistant.md` |
| Geospatial/Emergency | `references/mobility-emergency.md` |
| Simulation | `references/simulation.md` |
| Mensajería | `references/messaging.md` |
| Proveedores/URLs | `references/providers.md` |
| Quality/Security | `references/quality-gates.md` |
| Workflow de ejecución | `references/workflows.md` |

## Protocolo de eficiencia de tokens

### Antes de leer archivos

1. Identifica el punto de entrada probable.
2. Usa búsquedas dirigidas (`rg`, `git grep`, búsqueda por símbolo) antes de leer carpetas completas.
3. Lee primero interfaces, tipos, rutas y tests relacionados; después implementaciones.
4. Evita repetir lecturas del mismo archivo si no cambió.
5. Usa `git diff`, `git status` y tests como memoria de trabajo.

### Durante cambios

- Cambia primero la pieza mínima que prueba la hipótesis.
- Ejecuta validación corta después del cambio crítico.
- Agrupa cambios coherentes; no hagas micro-ediciones separadas sin necesidad.
- No generes documentación extensa si no se modificó el contrato/arquitectura.

### Reintentos

No repitas una herramienta fallida sin cambiar la causa probable. Después de un fallo:

1. identifica la causa;
2. corrige la entrada/configuración;
3. reintenta una vez;
4. si vuelve a fallar, aisla el problema y sigue con diagnóstico.

## Protocolo de auditoría inicial

Cuando sea la primera sesión o se cambie una parte estructural:

1. inspecciona `package.json`, lockfile, estructura `src/`, apps/packages y configuración;
2. identifica DB/ORM/auth/realtime/storage/voice/maps;
3. ejecuta pruebas existentes de forma dirigida;
4. genera o actualiza `docs/architecture/CURRENT_ARCHITECTURE.md`;
5. genera `REUSE_MATRIX.md` solo si hay cambios grandes;
6. registra decisiones nuevas como ADR.

No hagas una auditoría completa en cada tarea si ya existe una auditoría reciente y el área no cambió.

## Contrato de implementación

Toda feature debe seguir:

`Discover → Define → Implement → Verify → Record`

### Discover

Encontrar módulo, patrón existente, contrato, tests y dependencias.

### Define

Precisar entrada, salida, estados, errores, permisos y criterios de aceptación.

### Implement

Modificar la menor superficie posible.

### Verify

Ejecutar validaciones proporcionales al riesgo.

### Record

Actualizar docs/ADR/changelog solo cuando el cambio lo requiera.

## Contratos críticos del proyecto

### Assistant

`Voice → Realtime/STT → Tool Call → Authorization/Confirmation → Application Service → Domain → Result → Voice`

La IA jamás modifica directamente DB/Redis.

### Messaging

`Client → API/WS → Validation → Idempotency → PostgreSQL → Event → WS/Push`

### Location

`Device → Permission → Location Session → Validation → Redis current state → PostGIS/history when needed`

### Emergency

`Verified Ambulance → Emergency → Route → Dynamic Corridor → Candidate Drivers → Conflict Engine → Alert Policy → WS/Push/Voice`

### Simulation

`Scenario → Virtual Vehicles → Deterministic Replay → Engine → Metrics → Report`

## Seguridad especial

Nunca:

- hardcodear secretos;
- exponer API keys privadas al cliente;
- confiar en `role` enviado por el cliente;
- permitir emergencia a usuarios no autorizados;
- compartir ubicación de terceros sin autorización;
- ejecutar acciones críticas solo por interpretación LLM;
- registrar audio/ubicación sensible en logs sin necesidad.

## Dependencias externas

Para APIs/SDKs actuales, consulta `references/providers.md` y la documentación oficial antes de cambiar código. No uses ejemplos viejos como contrato.

## Definition of Done

No marques una tarea como terminada hasta comprobar lo aplicable:

- [ ] comportamiento correcto;
- [ ] errores manejados;
- [ ] permisos/autorización;
- [ ] idempotencia si hay escritura/eventos;
- [ ] tests relevantes;
- [ ] lint;
- [ ] typecheck;
- [ ] build;
- [ ] E2E o simulación en flujos críticos;
- [ ] diff mínimo y limpio;
- [ ] documentación actualizada cuando corresponda.

## Comandos de cierre recomendados

Usa los scripts reales del repositorio. Si existen, prioriza:

```bash
npm test -- --runInBand
npm run lint
npm run typecheck
npm run build
```

No ejecutes comandos que no existan solo porque aparecen arriba. Descubre primero `package.json`.

## Comportamiento de salida

Al terminar una tarea, responde de forma compacta:

1. qué cambió;
2. qué se verificó;
3. cualquier riesgo/bloqueo real.

No vuelvas a explicar toda la arquitectura salvo que haya cambiado.
