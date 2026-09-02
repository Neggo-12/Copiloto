import { pathLengthMeters } from "../../../common/geo/interpolate";
import type { LatLng } from "../../../common/geo/types";
import type { SimulationScenario, VirtualVehicleSpec } from "../simulation.types";

/**
 * Escenario 5 del roadmap (Etapa 7, `04_ROADMAP_Y_ALCANCE.md`): "GPS con
 * ruido". Complementa `verify-gps-noise.ts` (verificación real y directa de
 * `validateRawReport`/`normalizeReport`, el mecanismo de defensa contra
 * ruido — auditado antes de construir este escenario: `SimulationEngineService`
 * NUNCA pasa por esa validación, escribe directo a `LocationStateService`, así
 * que ese mecanismo necesitaba su propia verificación aparte). Este escenario
 * responde la pregunta complementaria: ya aceptado el reporte, ¿el CORREDOR
 * se comporta bien cuando la posición reportada tiembla (GPS real nunca es
 * una línea perfecta)?
 *
 * Determinista a propósito (regla del proyecto, mismo criterio que los
 * escenarios 1-4): el "ruido" es una oscilación `sin()` de la distancia
 * recorrida, NO `Math.random()` — misma corrida produce siempre el mismo
 * patrón.
 *
 * **Pieza nueva**: `ambulanceReportNoise` en `SimulationScenario` — el
 * vehículo se mueve por su ruta REAL (recta, movimiento físico normal,
 * timing correcto), pero lo que se REPORTA al corredor pasa por esta
 * función, que le agrega ruido encima. Primera versión de este escenario
 * metía el ruido directo en `ambulance.routePoints` (un zigzag real) — eso
 * distorsionaba el LARGO del recorrido (arco > línea recta) y por lo tanto
 * el tiempo real de viaje, así que el "temblor" nunca coincidía con el paso
 * simulado esperado. Corregido desacoplando ruido de sensor de movimiento
 * físico, antes de seguir con datos que no correspondían a lo que se quería
 * probar.
 *
 * Dos zonas de ruido en el trayecto de la ambulancia (medidas en distancia
 * recorrida, no en tiempo):
 * - 0-1000m y 1400-2400m: ruido urbano típico (±15m) — bien por debajo del
 *   umbral de 60m (`OFF_ROUTE_THRESHOLD_METERS`). Nunca debe verse como
 *   desvío ni disparar recálculo de ruta.
 * - 1000-1400m: zona adversarial (±65m, deliberadamente A CABALLO del
 *   umbral de 60m) — simula una mala zona de señal (edificios altos, túnel
 *   corto). El paso 4 (1200m recorridos) cae justo en esta zona. Prueba que
 *   el cooldown de recálculo (`tryReroute`, 30s, agregado 2026-09-01) actúa
 *   ante un desvío real detectado, sin que el resto de los pasos (ruido
 *   normal) dispare nada.
 */
const ORIGIN: LatLng = { latitude: 6.35, longitude: -75.65 };
const METERS_PER_DEGREE_LAT = 111_320;

function northOf(origin: LatLng, meters: number): LatLng {
  return { latitude: origin.latitude + meters / METERS_PER_DEGREE_LAT, longitude: origin.longitude };
}

function eastOf(point: LatLng, meters: number): LatLng {
  const metersPerDegreeLng = METERS_PER_DEGREE_LAT * Math.cos((point.latitude * Math.PI) / 180);
  return { latitude: point.latitude, longitude: point.longitude + meters / metersPerDegreeLng };
}

const AMBULANCE_SPEED_MPS = 15; // 54 km/h — mismo buffer (~270m) que los escenarios anteriores.
const ROUTE_LENGTH_METERS = 2400;
const ADVERSARIAL_ZONE_START_METERS = 1000;
const ADVERSARIAL_ZONE_END_METERS = 1400;
const NORMAL_NOISE_AMPLITUDE_METERS = 15; // ruido urbano típico, bien bajo el umbral de 60m.
const ADVERSARIAL_NOISE_AMPLITUDE_METERS = 65; // a caballo del umbral de 60m a propósito.
/**
 * Longitud de onda del temblor — solo afecta la posición REPORTADA, no el
 * largo real recorrido, así que puede ser cualquier valor sin distorsionar
 * el tiempo de viaje. 700m elegido para que el paso 4 (1200m recorridos,
 * el único paso simulado dentro de la zona adversarial 1000-1400m) caiga
 * cerca de un pico de la onda (`sin` ≈ ±0.98) — con la fase exacta del
 * `sin()`, un múltiplo "redondo" (400m, 600m) hace que 1200m caiga
 * justo en un cruce por cero por coincidencia numérica, sin ruido real en
 * ese paso — verificado corriendo el escenario, no adivinado.
 */
const NOISE_WAVELENGTH_METERS = 700;

function amplitudeAt(distanceMeters: number): number {
  if (distanceMeters >= ADVERSARIAL_ZONE_START_METERS && distanceMeters < ADVERSARIAL_ZONE_END_METERS) {
    return ADVERSARIAL_NOISE_AMPLITUDE_METERS;
  }
  return NORMAL_NOISE_AMPLITUDE_METERS;
}

/** Ruta REAL de la ambulancia — recta, movimiento físico normal a velocidad constante (el ruido se aplica aparte, solo a lo reportado — ver `ambulanceReportNoise`). */
const PLANNED_ROUTE: LatLng[] = [ORIGIN, northOf(ORIGIN, ROUTE_LENGTH_METERS)];

/**
 * Candidato que también "tiembla" (GPS de un vehículo parado, con su propio
 * ruido alrededor de una posición fija) a caballo del umbral crítico real
 * (buffer=270m con `AMBULANCE_SPEED_MPS`, crítico<=67.5m — ver
 * `emergency-corridor.service.ts`). Oscila entre 50m y 85m de distancia
 * lateral, cruzando el umbral crítico varias veces — prueba que el cooldown
 * de 30s de `AlertPolicyService` (mismo mecanismo `SET NX EX` que ya se usa
 * para alertas) no lo alerta más de lo necesario solo por el temblor. Este
 * SÍ usa `routePoints` con múltiples puntos directamente (no
 * `ambulanceReportNoise`, que es solo para la ambulancia) porque su
 * velocidad real es despreciable (vehículo parado, no importa que el
 * "arco" de su temblor sea más largo que su desplazamiento neto).
 */
function buildFlickerCandidate(): VirtualVehicleSpec {
  const centerDistanceMeters = 700; // dentro de la zona de ruido normal de la ambulancia, para no mezclar variables.
  const centerLateralMeters = 67.5; // umbral crítico exacto con buffer=270m.
  const flickerAmplitudeMeters = 17.5; // oscila entre 50m y 85m — cruza el umbral crítico repetidas veces.
  const points: LatLng[] = [];
  for (let k = 0; k <= 16; k++) {
    const lateral = centerLateralMeters + flickerAmplitudeMeters * Math.sin((k * Math.PI) / 2); // periodo de 4 puntos → varios cruces en 16 puntos.
    points.push(eastOf(northOf(ORIGIN, centerDistanceMeters), lateral));
  }
  // Velocidad calculada para recorrer TODO el rastro de temblor exactamente en los 8 pasos (160s) del escenario — sigue temblando en cada paso, no se "congela" a mitad de camino.
  const totalWobbleMeters = pathLengthMeters(points);
  const speedMps = totalWobbleMeters / (8 * 20);
  return { id: "sim5-boundary-flicker", kind: "car", routePoints: points, speedMps };
}

export const SCENARIO_5_GPS_NOISE: SimulationScenario = {
  name: "5-gps-con-ruido",
  description:
    "La ambulancia se mueve por una ruta recta real (timing correcto), pero lo que reporta al corredor tiene ruido determinístico encima (±15m urbano normal, con una zona adversarial de ±65m a caballo del umbral de 60m). Valida que el corredor no confunda ruido normal con desvío real, que el cooldown de recálculo actúe correctamente ante un desvío real detectado por ruido, y que un candidato con su propio temblor (a caballo del umbral crítico) no dispare más alertas de las que el cooldown permite.",
  stepIntervalSeconds: 20,
  steps: 8,
  ambulance: {
    id: "sim5-ambulance",
    kind: "ambulance",
    routePoints: PLANNED_ROUTE,
    speedMps: AMBULANCE_SPEED_MPS,
  },
  ambulanceReportNoise: (truePosition, distanceTraveledMeters) => {
    const amplitude = amplitudeAt(distanceTraveledMeters);
    const jitterMeters = amplitude * Math.sin((distanceTraveledMeters * 2 * Math.PI) / NOISE_WAVELENGTH_METERS);
    return eastOf(truePosition, jitterMeters);
  },
  otherVehicles: [
    // Control positivo estable (sin ruido propio) — debe detectarse igual que en escenarios anteriores, sin que el ruido de la ambulancia lo afecte.
    { id: "sim5-near-stable", kind: "car", routePoints: [eastOf(northOf(ORIGIN, 300), 30)], speedMps: 0 },
    buildFlickerCandidate(),
    // Control lejano — nunca debe alertarse.
    { id: "sim5-far-control", kind: "car", routePoints: [eastOf(ORIGIN, 5000)], speedMps: 0 },
  ],
};
