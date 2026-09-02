import type { LatLng } from "../../../common/geo/types";
import type { SimulationScenario } from "../simulation.types";

/**
 * Escenario 4 del roadmap (Etapa 7, `04_ROADMAP_Y_ALCANCE.md`): "Vehículo
 * fuera de ruta". Interpretado para el corredor de emergencia (no
 * navegación genérica): la AMBULANCIA se desvía de su ruta planeada a
 * mitad de trayecto (real: tráfico, calle cerrada, decisión del
 * conductor). Pregunta real que este escenario responde: cuando eso pasa,
 * ¿el corredor sigue protegiendo a quien está cerca de por dónde va la
 * ambulancia DE VERDAD, o sigue "protegiendo" el camino abandonado?
 *
 * Auditoría antes de construir (no adivinado): `location.gateway.ts` ya
 * usa `computeDeviation` para avisarle al conductor "te saliste de tu
 * ruta" en cada reporte de ubicación — pero es solo informativo, nunca
 * dispara un recálculo del `encodedPolyline` guardado por
 * `RouteSessionService.start()`, y `EmergencyCorridorService.
 * findCandidates()` no llama a `computeDeviation` en absoluto. Es decir:
 * el corredor SIEMPRE usa la ruta planeada original para buscar
 * candidatos, sin importar hacia dónde se desvíe el GPS real — un gap
 * arquitectónico real, no hipotético, confirmado leyendo el código antes
 * de escribir este escenario.
 *
 * Mecanismo: el motor de simulación ahora soporta
 * `ambulancePlannedRoutePoints` distinto de `ambulance.routePoints` (ver
 * `SimulationEngineService.run`) — el vehículo se mueve por su posición
 * real, el corredor sigue usando la ruta planeada, igual que en
 * producción.
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

const AMBULANCE_SPEED_MPS = 15; // 54 km/h — mismo buffer (~270m) que los escenarios anteriores.
const PLANNED_ROUTE_LENGTH_METERS = 2000;
const DEVIATION_AT_METERS = 1000; // a mitad de camino se desvía
const DEVIATION_EAST_METERS = 400; // se aleja 400m al este de la ruta planeada — mucho más que el buffer máximo (400m), para que el efecto sea inequívoco.

/** Ruta PLANEADA (lo que el corredor cree que es la ruta) — recta, igual que los escenarios anteriores. */
const PLANNED_ROUTE: LatLng[] = [ORIGIN, northOf(ORIGIN, PLANNED_ROUTE_LENGTH_METERS)];

/**
 * Ruta REAL (por dónde se mueve la ambulancia de verdad): sigue lo
 * planeado hasta la mitad, se desvía 400m al este, y continúa hacia el
 * norte por ese carril desviado hasta el final — nunca vuelve a la ruta
 * original. Largo total: 1000 + 400 + 1000 = 2400m → a 15m/s son 160s,
 * exactamente 8 pasos de 20s (mismo total de pasos que los escenarios
 * anteriores).
 */
const ACTUAL_ROUTE: LatLng[] = [
  ORIGIN,
  northOf(ORIGIN, DEVIATION_AT_METERS),
  eastOf(northOf(ORIGIN, DEVIATION_AT_METERS), DEVIATION_EAST_METERS),
  eastOf(northOf(ORIGIN, PLANNED_ROUTE_LENGTH_METERS), DEVIATION_EAST_METERS),
];

export const SCENARIO_4_VEHICLE_OFF_ROUTE: SimulationScenario = {
  name: "4-vehiculo-fuera-de-ruta",
  description:
    "La ambulancia se desvía 400m al este a mitad de su ruta planeada (real: tráfico, calle cerrada) y nunca vuelve. Valida si el corredor sigue protegiendo por dónde va la ambulancia DE VERDAD, o sigue usando la ruta abandonada.",
  stepIntervalSeconds: 20,
  steps: 8,
  ambulance: {
    id: "sim4-ambulance",
    kind: "ambulance",
    routePoints: ACTUAL_ROUTE,
    speedMps: AMBULANCE_SPEED_MPS,
  },
  ambulancePlannedRoutePoints: PLANNED_ROUTE,
  otherVehicles: [
    // Antes de la desviación (300m norte) — planeada y real coinciden acá. Control de cordura: debe detectarse igual que en los escenarios anteriores.
    { id: "sim4-near-early-shared", kind: "car", routePoints: [eastOf(northOf(ORIGIN, 300), 30)], speedMps: 0 },
    // Cerca de la ruta PLANEADA, después del punto de desviación (1500m norte, línea original) — la ambulancia NUNCA pasa por ahí de verdad.
    {
      id: "sim4-near-planned-abandoned",
      kind: "car",
      routePoints: [eastOf(northOf(ORIGIN, 1500), 30)],
      speedMps: 0,
    },
    // Cerca de la ruta REAL, después de la desviación (1500m norte, carril desviado 400m al este) — la ambulancia SÍ pasa justo al lado de verdad.
    {
      id: "sim4-near-actual-detour",
      kind: "motorcycle",
      routePoints: [eastOf(northOf(ORIGIN, 1500), 430)],
      speedMps: 0,
    },
    // Control lejano, sin relación con ninguna de las dos rutas.
    { id: "sim4-far-control", kind: "car", routePoints: [eastOf(ORIGIN, 5000)], speedMps: 0 },
  ],
};
