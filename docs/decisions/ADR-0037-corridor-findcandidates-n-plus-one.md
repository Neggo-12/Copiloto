# ADR-0037: Fase 8 (Rendimiento) — N+1 real de Redis en `findCandidates`, encontrado y corregido con prueba de carga real

- Fecha: 2026-09-02
- Estado: **corregido el mismo día**, con evidencia real de antes/después (prueba de carga real, no estimada).

## Contexto

Con el hallazgo de seguridad de WebSockets ya corregido (ADR-0036), seguía
pendiente el bloque "Rendimiento" de la Fase 8 (`04_ROADMAP_Y_ALCANCE.md`,
Etapa 8): load tests, Redis tuning, DB indexes, PostGIS optimization,
WebSocket scaling.

Primer paso real (Discover, no adivinar): auditar qué parte del hot path
realtime del corredor de emergencia es medible con evidencia 100% real en
este sandbox. Resultado de la auditoría: **todo** el hot path
(`location:update`, `RouteSessionService`, `EmergencyCorridorService.findCandidates`)
es Redis-only por diseño — ninguno toca Postgres (decisión explícita ya
documentada en los comentarios de `LocationStateService`/`RouteSessionService`:
"estado caliente en Redis, no en Postgres, no hay consumidor real de
histórico todavía"). Esto significa que se puede medir con Redis real local,
sin necesitar credenciales de Supabase (que no existen en este sandbox).

Fuera de alcance, a propósito: `GeofenceTriggerService` (recordatorios por
ubicación) sí depende de `LocationRemindersService`, que sí necesita
Postgres/Supabase real — no se midió, en vez de fingir un resultado.

## Prueba de carga real (`loadtest-corridor.ts`, throwaway, no comiteado)

Con Redis real local (mismas clases reales del backend, instanciadas
directo — mismo patrón de los `verify-*.ts` de sesiones anteriores):

- **Parte A** — `location:update` (rate limit + `LocationStateService.setCurrent`):
  300 usuarios reales concurrentes × 20 reportes cada uno = 6000 operaciones
  reales, ~14 300 ops/seg, p50 16.7ms / p95 59.6ms. Sin sorpresas — bien
  dentro de lo esperable para una sola conexión de Redis compartida (mismo
  diseño que usa el backend real, `RedisModule`).
- **Parte B** — `EmergencyCorridorService.findCandidates` con 500 usuarios
  reales cerca de una ruta de 2km (20 muestras hacia adelante, ver
  `sampleAhead`): **2579 comandos reales de Redis por una sola consulta**,
  p50 182ms / p95 258ms.

## Hallazgo real (verificado, no adivinado)

`findCandidates` llama `LocationStateService.findNearby(punto, buffer)` una
vez por cada una de las hasta 20 muestras hacia adelante del corredor. Cada
llamada a `findNearby` hace un `GEOSEARCH` real MÁS un `GET` real
(`getCurrent`) por CADA resultado — pero un mismo candidato real, cercano a
varias muestras consecutivas (las muestras están a solo 100m entre sí, y el
buffer dinámico va de 150m a 400m), aparece en el resultado de `GEOSEARCH`
de más de una muestra. Antes de este fix, `getCurrent` se pagaba una vez por
cada muestra en la que el candidato aparecía, no una vez por candidato real
— el dedup (`Map` por distancia mínima) pasaba DESPUÉS de ya haber pagado
ese costo redundante.

Con densidad de candidatos alta (evento real: hora pico, zona céntrica, un
concierto), esto escala mal — cada candidato adicional cerca de la ruta no
cuesta 1 comando extra, cuesta hasta ~4 (uno por cada muestra de 100m dentro
de cuyo radio cae).

## Corrección real

`LocationStateService` gana un método nuevo, `geosearchNearby` — la misma
llamada `GEOSEARCH` de siempre, pero SIN el `getCurrent` por resultado
(`findNearby` ahora se reimplementa encima de este método nuevo, sin
duplicar la llamada a Redis — mismo criterio REUSE que el resto del
proyecto). `EmergencyCorridorService.findCandidates` cambia a: juntar los
resultados de `geosearchNearby` de TODAS las muestras primero (dedup por
distancia mínima, exactamente la misma lógica de `Map` que ya existía), y
recién ENTONCES llamar `getCurrent` — una sola vez por candidato único — para
revalidar frescura antes de devolver el resultado final.

El resultado devuelto es idéntico al de antes (mismo candidato más cercano
entre todas las muestras, mismo filtro de frescura, misma exclusión de la
propia ambulancia y de otras ambulancias activas) — lo único que cambia es
CUÁNDO se paga el costo de revalidar cada usuario.

## Verificación

**Correctitud** (`verify-corridor-refactor.ts`, throwaway, escenario
determinista sin aleatoriedad): un candidato real construido a propósito
para caer dentro del radio de dos muestras consecutivas aparece
**exactamente una vez** en el resultado, con la distancia mínima entre
ambas muestras; un candidato fuera de rango no aparece; un candidato con
reporte de hace 60s (> `STALE_AFTER_MS`=30s) se filtra igual que antes; la
propia ambulancia nunca aparece en sus propios candidatos. 6/6 casos reales
pasaron.

**Rendimiento** (`loadtest-corridor.ts`, mismo escenario real de 500
candidatos / 20 muestras, antes y después del fix):

| Métrica | Antes | Después | Mejora real |
|---|---|---|---|
| Comandos reales de Redis por consulta | 2579 | 548 | ~4.7× menos |
| Latencia p50 | 182ms | 25.5ms | ~7.1× más rápido |
| Latencia p95 | 258ms | 86.7ms | ~3× más rápido |

`typecheck`/`lint`/`build` del backend completo, limpios. Scripts throwaway
(`loadtest-corridor.ts`, `verify-corridor-refactor.ts`), borrados tras la
corrida, no comiteados.

## Pendiente real, no resuelto en este cambio

- El resto del bloque Rendimiento de la Fase 8 (Redis tuning, DB indexes,
  PostGIS optimization, WebSocket scaling) sigue sin auditar — este cambio
  cubre específicamente el N+1 encontrado en `findCandidates`.
- No se midió `GeofenceTriggerService`/`LocationRemindersService` (necesita
  Postgres/Supabase real, sin credenciales en este sandbox).
- Si la evidencia real de uso (piloto controlado, Etapa 9) muestra que 548
  comandos por consulta todavía es alto para la escala real esperada, el
  siguiente paso natural sería un `MGET` real por lote en vez de `GET`
  individual por candidato único — no se implementó ahora por no tener
  todavía evidencia real de que haga falta (regla del proyecto: "no
  complejidad sin evidencia").

## Referencias

- `docs/decisions/ADR-0036-websocket-rate-limiting-gap.md` (mismo día, mismo bloque de Fase 8, hallazgo distinto)
- `docs/decisions/05_CRONOGRAMA_EMERGENCY_Y_NUEVAS_FUNCIONALIDADES.md` (Fase 8)
- `backend/src/modules/location/location-state.service.ts` (`geosearchNearby`, nuevo)
- `backend/src/modules/emergency-corridor/emergency-corridor.service.ts` (`findCandidates`, refactorizado)
