import type { LatLng } from "../../../common/geo/types";
import type { SimulationScenario } from "../simulation.types";

/**
 * Escenario 1 del roadmap (Etapa 7, `04_ROADMAP_Y_ALCANCE.md`): "Una
 * ambulancia / 10 vehículos". Primer slice del simulador — valida que el
 * pipeline real (buffer dinámico + severidad + alertas + cooldown) se
 * comporta como se espera con una mezcla controlada de vehículos: algunos
 * deliberadamente dentro del buffer (deben alertarse), algunos
 * deliberadamente lejos (no deben alertarse). Geometría 100% sintética
 * (no son coordenadas reales de ninguna ciudad) — determinista, sin
 * aleatoriedad.
 */
const ORIGIN: LatLng = { latitude: 6.2, longitude: -75.58 };
/** Metros por grado de latitud — suficiente para un escenario sintético en línea recta norte-sur. */
const METERS_PER_DEGREE_LAT = 111_320;

function northOf(origin: LatLng, meters: number): LatLng {
  return { latitude: origin.latitude + meters / METERS_PER_DEGREE_LAT, longitude: origin.longitude };
}

/** Desplaza levemente en longitud — aproximación suficiente para separar un vehículo del eje de la ruta en un escenario sintético (no se usa para nada geodésico preciso). */
function eastOf(point: LatLng, meters: number): LatLng {
  const metersPerDegreeLng = METERS_PER_DEGREE_LAT * Math.cos((point.latitude * Math.PI) / 180);
  return { latitude: point.latitude, longitude: point.longitude + meters / metersPerDegreeLng };
}

const AMBULANCE_SPEED_MPS = 15; // 54 km/h — velocidad urbana típica, buffer resultante 270m (ver ADR-0021/0022).
const ROUTE_LENGTH_METERS = 2000;

export const SCENARIO_1_SINGLE_AMBULANCE_10_VEHICLES: SimulationScenario = {
  name: "1-ambulancia-10-vehiculos",
  description:
    "Una ambulancia recorriendo 2km a 54km/h; 6 vehículos cerca de la ruta a distancias variadas (para cubrir critical/warning/info/fuera de buffer) y 4 vehículos lejos, sin relación con el corredor.",
  stepIntervalSeconds: 20,
  steps: 8, // 8 × 20s = 160s, cubre los ~133s que toma recorrer 2000m a 15 m/s (los últimos pasos quedan clavados en el destino).
  ambulance: {
    id: "sim-ambulance-1",
    kind: "ambulance",
    routePoints: [ORIGIN, northOf(ORIGIN, ROUTE_LENGTH_METERS)],
    speedMps: AMBULANCE_SPEED_MPS,
  },
  otherVehicles: [
    // Cerca del origen — deben aparecer desde el primer paso. Buffer=270m: critical<=67.5m, warning<=162m, info<=270m.
    { id: "sim-car-critical", kind: "car", routePoints: [eastOf(northOf(ORIGIN, 50), 30)], speedMps: 0 },
    { id: "sim-car-warning", kind: "car", routePoints: [eastOf(northOf(ORIGIN, 50), 100)], speedMps: 0 },
    { id: "sim-motorcycle-info", kind: "motorcycle", routePoints: [eastOf(northOf(ORIGIN, 50), 200)], speedMps: 0 },
    { id: "sim-car-out-of-buffer", kind: "car", routePoints: [eastOf(northOf(ORIGIN, 50), 350)], speedMps: 0 },
    // Más adelante en la ruta — deben aparecer solo cuando la ambulancia se acerque (pasos intermedios/finales).
    { id: "sim-car-midroute", kind: "car", routePoints: [eastOf(northOf(ORIGIN, 1000), 60)], speedMps: 0 },
    { id: "sim-motorcycle-endroute", kind: "motorcycle", routePoints: [eastOf(northOf(ORIGIN, 1900), 40)], speedMps: 0 },
    // Lejos, sin relación con el corredor — nunca deben alertarse (control negativo).
    { id: "sim-control-far-1", kind: "car", routePoints: [eastOf(ORIGIN, 2000)], speedMps: 0 },
    { id: "sim-control-far-2", kind: "car", routePoints: [eastOf(ORIGIN, 3000)], speedMps: 0 },
    { id: "sim-control-far-3", kind: "motorcycle", routePoints: [northOf(ORIGIN, -500)], speedMps: 0 },
    { id: "sim-control-far-4", kind: "car", routePoints: [eastOf(northOf(ORIGIN, 1000), 2000)], speedMps: 0 },
  ],
};
