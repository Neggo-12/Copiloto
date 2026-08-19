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
