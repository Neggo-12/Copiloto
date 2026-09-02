# Cronograma — Ambulancia (Emergency Corridor) y nuevas funcionalidades

Este documento traduce el roadmap maestro (`docs/decisions/04_ROADMAP_Y_ALCANCE.md`,
Etapas 0–12) en un plan de ejecución concreto, respondiendo directamente al pedido
de empezar por la función de ambulancia y organizar el resto de lo nuevo.

## Punto de partida honesto

Hoy, según `docs/architecture/MISSING_CAPABILITIES.md`, todo el dominio Emergency
(corredor dinámico, Conflict Engine, Alert Policy) está en **0% de implementación** —
solo existe como diseño conceptual. Lo mismo aplica a Location/Maps/Navigation y al
Asistente de voz: no hay ni una línea de código todavía.

Eso importa porque la función de ambulancia **no se puede construir aislada**. Según
la referencia técnica del propio proyecto (`references/mobility-emergency.md`), el
corredor de emergencia sigue este pipeline obligatorio:

```
ruta (geometría real) → segmentos de ruta → buffer dinámico → conductores candidatos
→ detección de conflicto → política de alertas
```

Sin una ruta real (Google Routes) y sin tracking de GPS en vivo de los conductores,
no hay "corredor" que calcular ni "conflicto" que detectar — sería una función
decorativa, no la ambulancia real que se pidió. Por eso el cronograma abajo pone
primero la base mínima de Location/Navigation que la ambulancia necesita para
funcionar de verdad, y deja todo lo que NO bloquea la ambulancia corriendo en
paralelo o después.

## Cronograma

| Fase | Contenido | Depende de | Bloquea la ambulancia | Estimado* |
|---|---|---|---|---|
| 0 — Hecho | Mensajería core: contactos, chats 1-a-1, texto en tiempo real, entregado/leído, CI | — | — | ✅ completado |
| 1 — Fundación | Redis/BullMQ (estado caliente, cooldowns), capa de permisos/autorización, observabilidad básica, habilitar PostGIS en Supabase | Fase 0 | Sí | 1–2 semanas |
| 2 — Location & Navigation | Permiso y sesión de GPS, adapters `RoutingProvider`/`GeocodingProvider`/`PlacesProvider`/`NavigationProvider` sobre Google Maps Platform, ubicación actual/heading/speed, cálculo de ETA | Fase 1 | Sí | 2–3 semanas |
| 3 — Emergency Corridor (la ambulancia) | ✅ Rol "ambulancia verificada" (ADR-0006, hoy solo asignable por SQL/MCP directo, sin panel de administrador), activación por ruta real (`RouteSessionService`), corredor geoespacial con buffer dinámico por velocidad (ADR-0021), candidatos (ADR-0012), Alert Policy con dedup+cooldown y canal recomendado carro/moto (ADR-0013/0017), severidad `INFO/WARNING/CRITICAL` (ADR-0021), cierre real `completed/cancelled/expired` con UI de ambulancia (botones "Finalizar"/"Cancelar") y aviso real "ya pasó" al afectado (ADR-0020, cerrado 2026-09-01). Diferido a propósito, sin evidencia de que haga falta: estados intermedios `ACTIVE_CONFLICT`/`PASSED` (necesitan velocidad relativa/historial de trayectoria que no existe todavía) y panel de administrador para verificar ambulancias | Fase 2 | — (es el objetivo) | 3–4 semanas — **cerrado** |
| 4 — Simulación del corredor | Vehículos virtuales (ambulancia/carro/moto), reproducción determinística, los 12 escenarios mínimos del roadmap. ✅ Escenario 1 (10 vehículos, ADR-0022 — encontró y corrigió un bug real de muestreo en `sampleAhead`), ✅ Escenario 2 (100 vehículos — valida escala real de `findNearby`/GEOSEARCH), ✅ Escenario 3 (tres ambulancias simultáneas — valida aislamiento real entre corredores concurrentes) y ✅ Escenario 4 (vehículo fuera de ruta, 2026-09-01 — encontró y corrigió DOS bugs reales: el corredor seguía protegiendo la ruta abandonada cuando la ambulancia se desviaba en vez de proteger por dónde iba de verdad, y `computeDeviation` media distancia al vértice más cercano en vez de al segmento, causando falsos "fuera de ruta" en tramos rectos largos — este segundo bug también afectaba producción real en `location.gateway.ts`). ✅ Recálculo real de ruta al detectar desvío (2026-09-01, ver ADR-0022): antes el escenario 4 solo protegía un radio alrededor de la posición actual sin recalcular — ahora `EmergencyCorridorService` llama de verdad a Google Routes (mismo `RoutingProvider` de Fase 2, con cooldown real de 30s para no gastar de más) y actualiza la ruta activa cuando detecta desvío; decisión que el fundador pidió construir explícitamente (antes diferida a propósito por el costo real de la API). ✅ Escenario 5 (GPS con ruido, 2026-09-02 — dos partes: verificación real y directa de `validateRawReport`/`normalizeReport`, el mecanismo de defensa contra ruido que `SimulationEngineService` nunca ejercitaba antes por escribir directo a Redis, 13/13 casos sin bugs encontrados; más un escenario con ruido determinístico `sin()` sobre lo que la ambulancia reporta al corredor, con una pieza nueva `ambulanceReportNoise` que desacopla el ruido de sensor del movimiento físico real, tras encontrar que meterlo directo en la ruta distorsionaba el tiempo de viaje). ✅ Escenario 6 (GPS atrasado, 2026-09-02 — dos partes, ambas verificadas con llamadas reales, sin necesitar un escenario nuevo del motor porque este atrasa a propósito el reloj, no el movimiento: (a) bug real corregido en `validateRawReport` — un reporte atrasado/fuera de orden se rechazaba con el motivo equivocado (`implausible_jump` en vez de un nuevo `out_of_order`), por un cálculo de velocidad implícita que forzaba un `deltaSeconds` mínimo artificial; (b) gap real de visibilidad corregido en `EmergencyCorridorService.findCandidates` — nunca revisaba si la posición conocida de la AMBULANCIA misma estaba atrasada (>30s), a diferencia de los candidatos, que sí se excluyen si están atrasados desde antes; se agregó una advertencia real en logs, sin cambiar el comportamiento de degradación ya existente). Pendiente: escenarios 7–12 (usuario sin conexión, reconexión WebSocket, ambulancia cancelada/terminada, conductor entra/sale del corredor, corredores que sí se cruzan), métricas de falsos positivos/conflictos perdidos, y un límite real (no urgente) encontrado en `sampleAhead`: su lookahead fijo de 2km puede alertar de más o dejar huecos reales en rutas sintéticas/con pocos waypoints — documentado en ADR-0022 (con una confirmación empírica adicional del caso simétrico, encontrada construyendo el Escenario 6), no corregido todavía por no ser lo pedido | Fase 3 | — | 1–2 semanas — en curso (6/12) |
| 5 — Mensajería pendiente *(en paralelo, no bloquea nada de arriba)* | ~~Multimedia real a Storage (fotos/documentos/audio)~~ (ADR-0031), ~~typing/presence~~ (ADR-0029), ~~notificaciones push~~ (Web Push, primer slice — ADR-0033), ~~rate limiting~~ (ADR-0032), ~~bug de chulos~~ (ya resuelto en el código real, `hydrateMessageStatuses`/`markChatReadRemote` — no se encontró `TECHNICAL_DEBT.md` en el repo, la referencia quedó obsoleta). Pendiente real de esta fila: push para mensajes nuevos de chat (hoy Supabase-directo, sin pasar por el backend) y FCM/APNs nativos cuando exista app empaquetada | Fase 0 | No | continuo, en paralelo |
| 6 — Asistente de voz | ~~Tool registry (`activate_emergency_corridor`, `calculate_route`, etc.) + capa de autorización LLM→dominio~~ (ADR-0016), ~~conexión real Voice→Realtime→Tool Call→Result, con audio real bidireccional (micrófono real → Gemini → voz real de vuelta) verificada de punta a punta contra un micrófono real~~ (ADR-0034, dos slices — reemplaza la elección de OpenAI Realtime de ADR-0016: el fundador habló por el micrófono real de `proyecto-mensajeria` y escuchó la respuesta real de Gemini en voz, con `list_vehicles` llamada real y dato real de Supabase devuelto correctamente). Pendiente real de esta fila: "Modo conducción" manos-libres de verdad (hoy hay que tocar y sostener la pantalla — falta activación por voz, funcionar con el teléfono bloqueado, UI pensada para no distraer manejando), mejorar el downsampling (hoy decimación simple, sin filtro anti-aliasing), interrupciones/VAD del lado del cliente, prueba en dispositivo móvil real, y decidir cómo confirmar por voz `activate_emergency_corridor` (hoy siempre queda en `needs_confirmation`, nunca se ejecuta por este camino) | Fase 2 (para las tools de navegación/emergencia) | No (la ambulancia arranca por botón primero; voz se agrega después) | 2–3 semanas |
| 7 — Recordatorios por ubicación | Geofencing, trigger engine, notificación/voz al entrar a la zona | Fase 2 | No | 1–2 semanas |
| 8 — Hardening + piloto controlado | Pruebas de seguridad/carga, y piloto real: 1 ambulancia simulada + 5–10 conductores → 1–3 ambulancias + 30–50 → 5–10 ambulancias + 100–500 | Fases 3–4 completas y estables | — | variable, no avanza por calendario sino por criterios de salida |
| 9+ — Mobility Intelligence / Traffic Prediction / Signal Priority | Eventos de vehículos pesados, riesgo de tráfico, simulador de semáforos | Fase 8 | No | largo plazo, después del MVP |

*Los estimados son de esfuerzo de desarrollo enfocado, no fechas de calendario
garantizadas — el propio roadmap del proyecto es explícito en esto: **"no avanzar
de etapa por calendario, avanzar cuando se cumpla: funcional + probado + observable
+ seguro + documentado + simulado donde aplique."**

## Ruta crítica para tener la ambulancia funcionando de verdad

```
Fase 1 (Fundación) → Fase 2 (Location & Navigation) → Fase 3 (Emergency Corridor)
→ Fase 4 (Simulación) → recién ahí piloto controlado con conductores reales
```

Eso son ~7–11 semanas de trabajo enfocado (fases 1–4) antes de tener un corredor de
emergencia real y validado por simulación — no antes, porque sin simulación no hay
forma responsable de probar "conflicto detectado" con vehículos reales en la calle.

La Fase 5 (resto de mensajería) puede avanzar en paralelo sin quitarle tiempo a la
ambulancia, porque no comparte dependencias técnicas con Location/Emergency.

## Reordenamiento 2026-08-19: Fase 7 adelantada

El fundador pidió adelantar la Fase 7 (Recordatorios por ubicación) y
preguntó cuáles fases la preceden. Respuesta, mirando la tabla de arriba:
Fase 7 depende únicamente de **Fase 2 (Location & Navigation)**, que ya está
100% completa y verificada contra Google Maps real. No depende de Fase 3
(Emergency Corridor, en curso), ni de Fase 4 (Simulación) ni de Fase 6
(Asistente de voz) — esas dependencias son solo de numeración de tabla, no
técnicas.

**Orden de ejecución ajustado** (los números de fase no cambian, para no
romper referencias cruzadas en ADRs existentes; lo que cambia es el orden en
que se ejecutan):

```
Fase 3 (Emergency Corridor, en curso) → Fase 7 (Recordatorios por ubicación)
→ Fase 4 (Simulación) → Fase 6 (Asistente de voz)
```

Fase 7 se adelanta frente a Fase 4 y Fase 6 porque: (a) no depende
técnicamente de ninguna de las dos, (b) reutiliza infraestructura que ya
existe y está verificada (`LocationStateService`, el stream de
`location:update` por WebSocket), y (c) es la pieza que hace realidad el
requisito del fundador de que la plataforma funcione completa como app de
mensajería para cualquier usuario, tenga o no vehículo (input de texto
primero; dictado por voz es una capacidad de Fase 6, se conecta después). La
Fase 4 (Simulación del corredor) sigue bloqueada por completar Fase 3, así
que no se pierde nada adelantando Fase 7 mientras tanto — es tiempo que de
otra forma quedaría esperando.

Como paso previo a Fase 7 se construyó el registro de vehículos y "modo de
manejo" (`docs/decisions/ADR-0014-vehicle-registration-and-driving-mode.md`)
— no es parte formal de ninguna fase numerada del roadmap original, pero es
un requisito de producto nuevo del fundador (carro+moto, modo de manejo) que
tenía sentido cerrar antes de entrar a recordatorios, dado que ambos tocan
"estado del usuario en este momento".

## Próximo paso concreto

Para arrancar la Fase 1 ya mismo, el primer bloque de trabajo es:
habilitar PostGIS en el proyecto Supabase, definir la capa de permisos/autorización
(quién puede activar una emergencia), y decidir si se usa Redis administrado o se
arranca con jobs más simples mientras el volumen es bajo (evitar complejidad
innecesaria, regla del propio proyecto de "no introducir infraestructura distribuida
sin evidencia de necesidad").
