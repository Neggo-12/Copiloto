import type { LatLng } from "../../common/geo/types";
import type { CorridorSeverity } from "../emergency-corridor/emergency-corridor.types";

export type VirtualVehicleKind = "ambulance" | "car" | "motorcycle";

/**
 * Un vehículo sintético del escenario. `routePoints` con un solo punto =
 * vehículo estacionado (tráfico detenido, un caso real y común); con 2+
 * puntos = vehículo en movimiento a `speedMps` constante a lo largo de esos
 * waypoints. Determinista a propósito: nada de posición aleatoria — mismos
 * `routePoints`/`speedMps` en dos corridas producen exactamente la misma
 * secuencia de posiciones.
 */
export interface VirtualVehicleSpec {
  id: string;
  kind: VirtualVehicleKind;
  routePoints: LatLng[];
  speedMps: number;
}

export interface SimulationScenario {
  name: string;
  description: string;
  /** Cada cuántos segundos simulados se avanza un paso — no es tiempo real, es tiempo del escenario. */
  stepIntervalSeconds: number;
  /** Cuántos pasos correr en total. */
  steps: number;
  ambulance: VirtualVehicleSpec;
  otherVehicles: VirtualVehicleSpec[];
  /**
   * Ruta que se registra como "ruta planeada" en `RouteSessionService`
   * (la que ve el corredor) — si se omite, es la misma que
   * `ambulance.routePoints` (el vehículo se mueve exactamente por donde el
   * corredor cree que va). Cuando se especifica y DIFIERE de
   * `ambulance.routePoints`, simula que el conductor se desvió de la ruta
   * planeada: el vehículo se mueve por su posición GPS real
   * (`ambulance.routePoints`) pero el corredor sigue registrando la ruta
   * planeada distinta — igual que en producción real, donde
   * `RouteSessionService` nunca recalcula el polyline guardado solo porque
   * el GPS se alejó de él (ver escenario 4, "vehículo fuera de ruta").
   */
  ambulancePlannedRoutePoints?: LatLng[];
  /**
   * Función opcional que transforma la posición VERDADERA de la ambulancia
   * (la que calcula `ambulance.routePoints`/`speedMps`, movimiento físico
   * real) en la posición REPORTADA (con ruido de GPS simulado encima).
   * Desacopla el ruido de sensor del movimiento físico real: si el ruido se
   * mete directo en `ambulance.routePoints` (un zigzag real), una amplitud
   * de ruido grande en poca distancia distorsiona el LARGO REAL del
   * recorrido (arco > línea recta), y con eso el tiempo/velocidad reales de
   * viaje — un vehículo no puede físicamente ir a 15m/s Y zigzaguear 65m
   * cada pocos metros. Encontrado construyendo el escenario 5 ("GPS con
   * ruido"): la primera versión metía el ruido directo en `routePoints` y
   * el "desvío" adversarial nunca coincidía con el paso simulado esperado,
   * porque el vehículo tardaba más de lo calculado en recorrer el zigzag.
   * Determinista a propósito (misma regla del resto del proyecto): debe ser
   * una función pura de `distanceTraveledMeters`, nunca de
   * `Date.now()`/`Math.random()`. Si se omite, se reporta la posición
   * verdadera tal cual (comportamiento de los escenarios 1-4, sin cambios).
   */
  ambulanceReportNoise?: (truePosition: LatLng, distanceTraveledMeters: number) => LatLng;
}

export interface SimulationStepResult {
  step: number;
  elapsedSeconds: number;
  ambulancePosition: LatLng;
  bufferMetersImplied: number | null;
  candidatesDetected: number;
  alertsDispatched: string[];
  skippedByCooldown: string[];
  findCandidatesLatencyMs: number;
  severityBreakdown: Record<CorridorSeverity, number>;
}

/**
 * Varios escenarios de UNA ambulancia cada uno, pensados para correr en
 * paralelo real contra el mismo Redis (ver `SimulationEngineService.
 * runConcurrent` — escenario 3 del roadmap: "tres ambulancias
 * simultáneas"). No es un tipo de escenario nuevo — es una lista de
 * `SimulationScenario` normales; lo único que agrega es la garantía de que
 * se corren concurrentemente, no uno tras otro.
 */
export interface CompoundSimulationScenario {
  name: string;
  description: string;
  scenarios: SimulationScenario[];
}

export interface SimulationReport {
  scenario: string;
  steps: SimulationStepResult[];
  totalAlerts: number;
  uniqueVehiclesAlerted: number;
  maxFindCandidatesLatencyMs: number;
  avgFindCandidatesLatencyMs: number;
  /**
   * Deliberadamente NO se reportan "falsos positivos" ni "conflictos
   * perdidos" todavía — calcularlos de verdad requiere una noción de
   * "verdad de terreno" (qué candidato DEBERÍA haber sido alertado) que
   * este primer slice no modela; inventar un número aquí sería simulación
   * de la métrica, no de la ambulancia. Se agrega cuando haya un escenario
   * con verdad de terreno explícita (ej. comparando contra una posición
   * conocida de conflicto real).
   */
}
