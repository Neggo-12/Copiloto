import type { LatLng } from "../../../common/geo/types";
import type { SimulationScenario, VirtualVehicleSpec } from "../simulation.types";

/**
 * Escenario 2 del roadmap (Etapa 7, `04_ROADMAP_Y_ALCANCE.md`): "Una
 * ambulancia / 100 vehículos". A diferencia del escenario 1 (correctitud
 * con una mezcla chica y controlada), este valida ESCALA: `findNearby`
 * (`LocationStateService`) usa Redis GEOSEARCH por radio — no un escaneo de
 * todos los vehículos registrados — así que el costo real no depende del
 * total de vehículos en el sistema, depende de cuántos caen DENTRO del
 * buffer en un momento dado (cada uno revalida su estado con un `GET` real
 * a Redis, ver `LocationStateService.findNearby`). Por eso este escenario no
 * dispersa los 100 vehículos al azar: pone 70 realmente cerca del corredor
 * (simulando un tramo con tráfico denso) para ejercitar de verdad ese
 * camino, y 30 lejos como control negativo — así el reporte de latencia
 * (`findCandidatesLatencyMs`) mide el caso que de verdad importa, no un
 * promedio inflado por vehículos irrelevantes.
 *
 * Mismo largo de ruta/velocidad que el escenario 1 (2km a 54km/h) a
 * propósito: permite comparar directamente `avgFindCandidatesLatencyMs`
 * entre ambos como línea base de "¿escala razonablemente de 10 a 100?".
 * Determinista — igual que el escenario 1, cero `Math.random()`.
 */
const ORIGIN: LatLng = { latitude: 6.2, longitude: -75.58 };
const METERS_PER_DEGREE_LAT = 111_320;

function northOf(origin: LatLng, meters: number): LatLng {
  return { latitude: origin.latitude + meters / METERS_PER_DEGREE_LAT, longitude: origin.longitude };
}

function eastOf(point: LatLng, meters: number): LatLng {
  const metersPerDegreeLng = METERS_PER_DEGREE_LAT * Math.cos((point.latitude * Math.PI) / 180);
  return { latitude: point.latitude, longitude: point.longitude + meters / metersPerDegreeLng };
}

const AMBULANCE_SPEED_MPS = 15; // 54 km/h — mismo buffer resultante (~270m) que el escenario 1.
const ROUTE_LENGTH_METERS = 2000;

/**
 * 70 vehículos "de tráfico" repartidos a lo largo de TODA la ruta (no solo
 * al inicio) — cada uno a una distancia lateral que cicla por las 4 zonas
 * reales de severidad (critical/warning/info/fuera-de-buffer, mismos cortes
 * que el escenario 1: 30/100/200/350m con buffer=270m), así se cubre la
 * mezcla completa de severidades en escala, no solo el caso "todos cerca".
 */
const NEAR_LATERAL_OFFSETS_METERS = [30, 100, 200, 350];

function buildNearVehicles(): VirtualVehicleSpec[] {
  const vehicles: VirtualVehicleSpec[] = [];
  const count = 70;
  for (let i = 0; i < count; i++) {
    const forwardMeters = Math.round((ROUTE_LENGTH_METERS * i) / count);
    const lateralMeters = NEAR_LATERAL_OFFSETS_METERS[i % NEAR_LATERAL_OFFSETS_METERS.length];
    vehicles.push({
      id: `sim100-near-${i}`,
      kind: i % 5 === 0 ? "motorcycle" : "car",
      routePoints: [eastOf(northOf(ORIGIN, forwardMeters), lateralMeters)],
      speedMps: 0,
    });
  }
  return vehicles;
}

/**
 * 30 vehículos de control, lejos del corredor por construcción (miles de
 * metros al este o al sur del origen) — nunca deben aparecer como
 * candidatos, sin importar en qué paso esté la ambulancia.
 */
function buildFarControlVehicles(): VirtualVehicleSpec[] {
  const vehicles: VirtualVehicleSpec[] = [];
  const count = 30;
  for (let i = 0; i < count; i++) {
    const farEastMeters = 5000 + i * 200;
    vehicles.push({
      id: `sim100-far-${i}`,
      kind: i % 3 === 0 ? "motorcycle" : "car",
      routePoints: [eastOf(northOf(ORIGIN, (ROUTE_LENGTH_METERS * i) / count), farEastMeters)],
      speedMps: 0,
    });
  }
  return vehicles;
}

export const SCENARIO_2_SINGLE_AMBULANCE_100_VEHICLES: SimulationScenario = {
  name: "1-ambulancia-100-vehiculos",
  description:
    "Una ambulancia recorriendo 2km a 54km/h con 100 vehículos de fondo: 70 repartidos a lo largo del corredor (mezcla completa de severidades, simulando tráfico denso) y 30 lejos como control negativo. Valida escala real de findNearby (GEOSEARCH por radio, no escaneo total) y compara latencia contra el escenario 1.",
  stepIntervalSeconds: 20,
  steps: 8,
  ambulance: {
    id: "sim100-ambulance",
    kind: "ambulance",
    routePoints: [ORIGIN, northOf(ORIGIN, ROUTE_LENGTH_METERS)],
    speedMps: AMBULANCE_SPEED_MPS,
  },
  otherVehicles: [...buildNearVehicles(), ...buildFarControlVehicles()],
};
