# ADR-0021 — Buffer dinámico por velocidad + severidad del corredor de emergencia

**Fecha:** 2026-08-19
**Estado:** Aceptado — verificado con Redis real, fixture de ruta real (encode/decode de polyline), 16/16 casos.

## Contexto

Del alcance original de Fase 3 quedaban pendientes: buffer dinámico por
velocidad, estados `ACTIVE_CONFLICT`/`PASSED`, y severidad
`INFO`/`WARNING`/`CRITICAL`. El fundador preguntó por los números exactos
del buffer dinámico (cuánto debía crecer el radio por velocidad) y,
explícitamente, delegó esa decisión: *"esa decisión se la dejo a usted en
el momento, tome la mejor"*.

Se dejan fuera de este slice, todavía sin construir: los estados
`ACTIVE_CONFLICT`/`PASSED` (requieren trayectoria/velocidad relativa del
candidato, dato que no existe todavía) y el job de barrido para expiración
silenciosa (ADR-0020). Se prioriza buffer dinámico + severidad porque ambos
se pueden calcular con datos que YA existen (velocidad de la ambulancia,
distancia del candidato) sin inventar infraestructura nueva.

## Decisión

### Buffer dinámico

Reemplaza el radio fijo de 200m (ADR-0012) por una función de la velocidad
real de la ambulancia (`location.speed`, m/s, ya reportado por
`location:update`):

```
buffer = clamp(150 + velocidad_mps × 8, 150, 400)   [metros]
```

Razonamiento de cada número:

- **150m mínimo**: el mismo orden de magnitud que el fijo anterior (200m),
  ligeramente más conservador hacia abajo para no sobre-alertar a velocidad
  cero/baja (una ambulancia detenida en un semáforo no necesita un radio de
  alerta tan ancho como una que va a 80km/h).
- **8 segundos de reacción**: tiempo conservador para "percibir la alerta +
  decidir + maniobrar el vehículo" en tránsito urbano — más que un simple
  tiempo de reacción visual, porque el candidato tiene que mover un
  vehículo, no solo reaccionar.
- **400m tope**: limita el costo real de cada consulta `GEOSEARCH` (radio
  más ancho = más candidatos a revalidar) y evita que un GPS con ruido
  (velocidad reportada absurdamente alta) dispare un buffer sin límite —
  probado explícitamente (velocidad de 200 m/s sigue topando en 400m).
- Sin velocidad reportada (`null`, o ≤0): usa el mínimo (150m) — la opción
  conservadora cuando no hay dato, no la más ancha.

Estos números son una primera decisión razonada con la información
disponible hoy, no un valor definitivo — quedan documentados como
ajustables con evidencia real de uso (ej. si en la práctica los candidatos
reportan que la alerta les llega tarde a alta velocidad, o que les sobra
margen a baja velocidad).

### Severidad

`CorridorSeverity = "info" | "warning" | "critical"`, calculada **relativa
al buffer del momento**, no a una distancia fija en metros — así la
severidad tiene el mismo significado ("qué tan cerca del borde del radio de
peligro estás") sin importar si la ambulancia va rápido o despacio:

```
critical:  distancia <= 25% del buffer
warning:   distancia <= 60% del buffer
info:      resto (dentro del buffer, por encima de 60%)
```

Se agregó `severity` a `CorridorCandidate` (lo que ve la ambulancia) y al
payload del evento `corridor:alert` (lo que recibe el candidato), y se
conectó en el frontend (`EmergenciaScreen.tsx`, `useCopilotoRealtime.ts`)
con una insignia visual (rojo=crítico, ámbar=atención, neutro=informativo)
en ambas vistas.

## Verificación (real, sin mocks)

Smoke test contra Redis real (`redis-server` local, limpiado al terminar)
con una ruta real construida con el mismo algoritmo de decodificación de
producción (`decodePolyline`) — el fixture se codificó con el algoritmo
estándar de Google Polyline (implementado solo en el script de prueba, sin
tocar `polyline.ts`, que a propósito solo tiene decode) — 16/16 casos:

- Ambulancia a 80km/h (22.22 m/s): buffer calculado 328m — candidato a 50m
  → `critical`, a 120m → `warning`, a 250m → `info`, a 500m queda fuera.
- Ambulancia detenida (`speed: null`): buffer 150m (mínimo) — el candidato a
  250m que SÍ entraba con buffer ancho queda fuera; el de 50m pasa de
  `critical` a `warning` porque el buffer se achicó.
- Velocidad absurda (200 m/s, simulando ruido de GPS): buffer topado en
  400m, confirmado que NO crece sin límite.

`typecheck`/`lint`/`build` limpios en backend y en `proyecto-mensajeria`
(incluye build de producción completo del frontend).

## Corrección posterior (ver ADR-0022)

El fixture de verificación de este ADR colocaba candidatos EXACTAMENTE
sobre la línea de la ruta (mismo eje que el origen-destino, solo variando
"cuán adelante"). Eso coincidía, por accidente, con un bug real de
muestreo que ADR-0022 encontró y corrigió (`sampleAhead` muestreaba por
índice de punto crudo, no por distancia real — con una ruta de pocos
waypoints, en la práctica solo consultaba el punto de origen). Con el
muestreo corregido, un candidato sobre la línea de la ruta queda
`critical` casi siempre sin importar cuán adelante esté (porque siempre
hay una muestra justo al lado suyo) — el comportamiento CORRECTO de un
corredor, no el de este ADR. La verificación de severidad válida ahora es
la de ADR-0022 (candidatos desplazados LATERALMENTE de la ruta, no sobre
ella) — la fórmula y los números de esta decisión (150/400/8s/25%/60%) no
cambiaron, solo el fixture de prueba que los ejercitaba.

## Alcance fuera de este slice

- Estados `ACTIVE_CONFLICT`/`PASSED` — necesitan trayectoria/velocidad
  relativa del candidato, dato que no existe todavía.
- Job de barrido para expiración silenciosa (ADR-0020).
- Ajuste de los números (150/400/8s/25%/60%) con evidencia real de uso en
  producción.

## Referencias

- `docs/decisions/ADR-0012-emergency-corridor-candidates.md`, `ADR-0013-alert-policy.md`, `ADR-0020-emergency-corridor-closure.md`
- `backend/src/modules/emergency-corridor/{emergency-corridor.service.ts,emergency-corridor.types.ts,alert-policy.service.ts}`
- `proyecto-mensajeria/src/components/copiloto/EmergenciaScreen.tsx`, `src/hooks/useCopilotoRealtime.ts`
