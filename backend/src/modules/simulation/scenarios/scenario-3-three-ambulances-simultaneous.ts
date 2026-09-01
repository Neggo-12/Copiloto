import type { LatLng } from "../../../common/geo/types";
import type { CompoundSimulationScenario, SimulationScenario } from "../simulation.types";

/**
 * Escenario 3 del roadmap (Etapa 7, `04_ROADMAP_Y_ALCANCE.md`): "Tres
 * ambulancias simultáneas". A diferencia de los escenarios 1 (correctitud)
 * y 2 (escala), este valida AISLAMIENTO: tres corredores activos al mismo
 * tiempo no deben contaminarse entre sí en Redis. Las tres rutas son
 * paralelas y NO se cruzan a propósito (corredores que sí se cruzan
 * geométricamente es el escenario 12, un problema distinto) — acá el foco
 * es "¿el estado de la ambulancia A afecta a la B o la C solo por correr al
 * mismo tiempo?".
 *
 * Geometría: tres carriles norte-sur separados en longitud.
 * - Ambulancia A: carril 0 (origen).
 * - Ambulancia B: carril a 500m al este.
 * - Ambulancia C: carril a 550m al este — deliberadamente cerca de B (solo
 *   50m de separación) para poner un candidato "compartido" exactamente a
 *   medio camino entre las dos, dentro del buffer crítico de AMBAS. Esto
 *   prueba algo que ningún escenario anterior probó: `corridor:alert:
 *   <ambulanceId>:<candidateId>` está aislado por PAR (ambulancia,
 *   candidato), así que ese mismo vehículo debe recibir una alerta
 *   independiente de B Y de C — no debe "gastarse" en la primera que lo
 *   detecte.
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

const AMBULANCE_SPEED_MPS = 15; // 54 km/h — mismo buffer (~270m) que los escenarios 1 y 2, para comparar.
const ROUTE_LENGTH_METERS = 2000;
const STEP_INTERVAL_SECONDS = 20;
const STEPS = 8;

function laneOrigin(eastOffsetMeters: number): LatLng {
  return eastOffsetMeters === 0 ? ORIGIN : eastOf(ORIGIN, eastOffsetMeters);
}

function buildAmbulanceScenario(
  name: string,
  ambulanceId: string,
  laneEastOffsetMeters: number,
  otherVehicles: SimulationScenario["otherVehicles"],
): SimulationScenario {
  const lane = laneOrigin(laneEastOffsetMeters);
  return {
    name,
    description: `Ambulancia "${ambulanceId}" en carril propio (${laneEastOffsetMeters}m al este del origen) — parte del escenario 3 (tres ambulancias simultáneas).`,
    stepIntervalSeconds: STEP_INTERVAL_SECONDS,
    steps: STEPS,
    ambulance: {
      id: ambulanceId,
      kind: "ambulance",
      routePoints: [lane, northOf(lane, ROUTE_LENGTH_METERS)],
      speedMps: AMBULANCE_SPEED_MPS,
    },
    otherVehicles,
  };
}

// Candidato exclusivo de A — nunca debe aparecer en los reportes de B ni C.
const NEAR_A_ONLY = {
  id: "sim3-near-a-only",
  kind: "car" as const,
  routePoints: [eastOf(northOf(laneOrigin(0), 200), 30)],
  speedMps: 0,
};

// Candidato compartido, a medio camino EXACTO entre B (500m) y C (550m) —
// a 25m de cada carril, dentro del buffer crítico (<=67.5m) de ambas.
const SHARED_B_AND_C = {
  id: "sim3-shared-b-and-c",
  kind: "motorcycle" as const,
  routePoints: [northOf(laneOrigin(525), 200)],
  speedMps: 0,
};

// Control negativo — lejos de las tres rutas, nunca debe alertarse.
const FAR_CONTROL = {
  id: "sim3-far-control",
  kind: "car" as const,
  routePoints: [eastOf(northOf(laneOrigin(0), 1000), 6000)],
  speedMps: 0,
};

const SCENARIO_A = buildAmbulanceScenario("sim3-ambulance-a", "sim3-ambulance-a", 0, [NEAR_A_ONLY, FAR_CONTROL]);
const SCENARIO_B = buildAmbulanceScenario("sim3-ambulance-b", "sim3-ambulance-b", 500, [SHARED_B_AND_C]);
const SCENARIO_C = buildAmbulanceScenario("sim3-ambulance-c", "sim3-ambulance-c", 550, [SHARED_B_AND_C]);

export const SCENARIO_3_THREE_AMBULANCES_SIMULTANEOUS: CompoundSimulationScenario = {
  name: "3-ambulancias-simultaneas",
  description:
    "Tres ambulancias en carriles paralelos (no se cruzan), corriendo al mismo tiempo (Promise.all real). Un candidato exclusivo de A, uno compartido entre B y C (debe alertarse por ambas, independientemente), y un control lejano que nunca debe alertarse en ninguna.",
  scenarios: [SCENARIO_A, SCENARIO_B, SCENARIO_C],
};
