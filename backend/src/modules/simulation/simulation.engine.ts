import { Injectable, Logger } from "@nestjs/common";
import { pathLengthMeters, pointAtDistanceAlongPath } from "../../common/geo/interpolate";
import { encodePolyline } from "../../common/geo/polyline";
import type { LatLng } from "../../common/geo/types";
import { LocationStateService } from "../location/location-state.service";
import type { NormalizedLocation } from "../location/location.types";
import { RouteSessionService } from "../route-session/route-session.service";
import { AlertPolicyService } from "../emergency-corridor/alert-policy.service";
import { dynamicBufferMeters, EmergencyCorridorService } from "../emergency-corridor/emergency-corridor.service";
import type { CorridorSeverity } from "../emergency-corridor/emergency-corridor.types";
import type {
  SimulationReport,
  SimulationScenario,
  SimulationStepResult,
  VirtualVehicleSpec,
} from "./simulation.types";

/**
 * Motor de simulación (Fase 7 del roadmap, Etapa 7 de
 * `04_ROADMAP_Y_ALCANCE.md`). Decisión de diseño central: el motor NO
 * reimplementa la lógica de detección de conflictos — alimenta datos
 * SINTÉTICOS a los MISMOS servicios reales que usa producción
 * (`LocationStateService`, `RouteSessionService`, `EmergencyCorridorService`,
 * `AlertPolicyService`). Si mañana cambia el Conflict Engine real, el
 * simulador automáticamente prueba el código nuevo — no una copia que se
 * puede desincronizar. Esto es lo que hace que el simulador sirva de verdad
 * ("no lanzar a usuarios antes de probar escenarios difíciles", roadmap
 * Etapa 7), no un teatro separado del sistema real.
 *
 * Determinista a propósito: nada de `Date.now()`/`Math.random()` en el
 * CÁLCULO de posiciones (solo se usa el reloj real para los timestamps de
 * `NormalizedLocation`, que Redis necesita de todos modos) — mismos
 * `routePoints`/`speedMps` producen siempre la misma secuencia de
 * posiciones y, por lo tanto, el mismo patrón de detección.
 */
@Injectable()
export class SimulationEngineService {
  private readonly logger = new Logger(SimulationEngineService.name);

  constructor(
    private readonly locationState: LocationStateService,
    private readonly routeSession: RouteSessionService,
    private readonly corridor: EmergencyCorridorService,
    private readonly alertPolicy: AlertPolicyService,
  ) {}

  async run(scenario: SimulationScenario): Promise<SimulationReport> {
    // Arranca la ruta real de la ambulancia — mismo objeto que crea
    // `POST /navigation/route-session` en producción, con una polyline
    // sintética codificada con el mismo formato que Google.
    const encodedPolyline = encodePolyline(scenario.ambulance.routePoints);
    const totalRouteMeters = pathLengthMeters(scenario.ambulance.routePoints);
    await this.routeSession.start(scenario.ambulance.id, {
      origin: scenario.ambulance.routePoints[0],
      destination: scenario.ambulance.routePoints[scenario.ambulance.routePoints.length - 1],
      encodedPolyline,
      distanceMeters: Math.round(totalRouteMeters),
      durationSeconds: Math.round(totalRouteMeters / scenario.ambulance.speedMps),
      startedAt: Date.now(),
    });

    const steps: SimulationStepResult[] = [];

    for (let step = 1; step <= scenario.steps; step++) {
      const elapsedSeconds = step * scenario.stepIntervalSeconds;

      // Posiciona a la ambulancia y a cada vehículo "de fondo" en su punto
      // correspondiente a este instante simulado — vehículos con un solo
      // punto de ruta quedan estacionados (tráfico detenido).
      const ambulancePosition = positionAtElapsedSeconds(scenario.ambulance, elapsedSeconds);
      await this.locationState.setCurrent(
        toNormalizedLocation(scenario.ambulance.id, ambulancePosition, scenario.ambulance.speedMps),
      );

      for (const vehicle of scenario.otherVehicles) {
        const position = positionAtElapsedSeconds(vehicle, elapsedSeconds);
        await this.locationState.setCurrent(toNormalizedLocation(vehicle.id, position, vehicle.speedMps));
      }

      // Mismo camino que ejecuta `GET /emergency/corridor/candidates` en
      // producción: encontrar candidatos + evaluar y despachar alertas.
      const startedAt = performance.now();
      const candidates = (await this.corridor.findCandidates(scenario.ambulance.id)) ?? [];
      const findCandidatesLatencyMs = performance.now() - startedAt;
      const dispatch = await this.alertPolicy.evaluateAndDispatch(scenario.ambulance.id, candidates);

      const severityBreakdown: Record<CorridorSeverity, number> = { info: 0, warning: 0, critical: 0 };
      for (const candidate of candidates) severityBreakdown[candidate.severity]++;

      steps.push({
        step,
        elapsedSeconds,
        ambulancePosition,
        bufferMetersImplied: dynamicBufferMeters(scenario.ambulance.speedMps),
        candidatesDetected: candidates.length,
        alertsDispatched: dispatch.alerted,
        skippedByCooldown: dispatch.skippedByCooldown,
        findCandidatesLatencyMs: Math.round(findCandidatesLatencyMs * 100) / 100,
        severityBreakdown,
      });
    }

    // Cierre real del corredor al terminar el escenario — mismo
    // `AlertPolicyService.closeCorridor`/`RouteSessionService.clear` que
    // usaría una ambulancia real al completar el traslado (ADR-0020).
    await this.alertPolicy.closeCorridor(scenario.ambulance.id, "completed");
    await this.routeSession.clear(scenario.ambulance.id);

    const allAlerted = steps.flatMap((s) => s.alertsDispatched);
    const latencies = steps.map((s) => s.findCandidatesLatencyMs);

    const report: SimulationReport = {
      scenario: scenario.name,
      steps,
      totalAlerts: allAlerted.length,
      uniqueVehiclesAlerted: new Set(allAlerted).size,
      maxFindCandidatesLatencyMs: latencies.length > 0 ? Math.max(...latencies) : 0,
      avgFindCandidatesLatencyMs:
        latencies.length > 0 ? Math.round((latencies.reduce((a, b) => a + b, 0) / latencies.length) * 100) / 100 : 0,
    };

    this.logger.log(
      `Escenario "${scenario.name}": ${report.totalAlerts} alerta(s) a ${report.uniqueVehiclesAlerted} vehículo(s) único(s) en ${scenario.steps} pasos`,
    );

    return report;
  }

  /**
   * Corre varios escenarios de una ambulancia cada uno, EN PARALELO REAL
   * (`Promise.all`) contra el mismo Redis — escenario 3 del roadmap: "tres
   * ambulancias simultáneas". No reimplementa nada: cada escenario corre
   * exactamente el mismo `run()` que uno individual. Lo que este método
   * pone a prueba es que las claves de Redis de cada ambulancia
   * (`corridor:active-ambulances` como SET compartido, `corridor:alerted:
   * <id>` y el cooldown por par, ambos ya con el `ambulanceDriverId` en la
   * clave) quedan realmente aisladas cuando las operaciones se intercalan
   * de verdad entre ambulancias, no cuando corren una detrás de otra.
   */
  async runConcurrent(scenarios: SimulationScenario[]): Promise<SimulationReport[]> {
    return Promise.all(scenarios.map((scenario) => this.run(scenario)));
  }
}

/**
 * Posición de un vehículo tras `elapsedSeconds` de simulación, viajando a
 * velocidad constante sobre sus waypoints (`pointAtDistanceAlongPath`,
 * compartida con `EmergencyCorridorService.sampleAhead` — ver ADR-0022).
 * Un vehículo con un solo punto de ruta está estacionado — devuelve siempre
 * ese punto. Si el vehículo ya "llegó" (distancia recorrida >= largo de la
 * ruta), se queda quieto en el último punto — no da la vuelta ni desaparece.
 */
function positionAtElapsedSeconds(vehicle: VirtualVehicleSpec, elapsedSeconds: number): LatLng {
  if (vehicle.routePoints.length === 1) return vehicle.routePoints[0];

  const distanceTraveled = vehicle.speedMps * elapsedSeconds;
  return (
    pointAtDistanceAlongPath(vehicle.routePoints, distanceTraveled) ??
    vehicle.routePoints[vehicle.routePoints.length - 1]
  );
}

function toNormalizedLocation(userId: string, position: LatLng, speedMps: number): NormalizedLocation {
  const now = Date.now();
  return {
    userId,
    latitude: position.latitude,
    longitude: position.longitude,
    accuracy: 10,
    speed: speedMps,
    heading: null,
    clientTimestamp: now,
    serverTimestamp: now,
    quality: "good",
  };
}
