import { Injectable } from "@nestjs/common";
import { haversineMeters } from "../../common/geo/haversine";
import { pointAtDistanceAlongPath } from "../../common/geo/interpolate";
import { decodePolyline } from "../../common/geo/polyline";
import type { LatLng } from "../../common/geo/types";
import { LocationStateService } from "../location/location-state.service";
import { RouteSessionService } from "../route-session/route-session.service";
import type { CorridorCandidate, CorridorSeverity } from "./emergency-corridor.types";

/**
 * Buffer dinámico por velocidad (ver ADR-0021): reemplaza el radio fijo de
 * 200m del primer slice. Un radio fijo se queda corto cuando la ambulancia
 * va rápido (menos tiempo real de reacción para el candidato) y sobra
 * cuando va despacio o detenida (alerta a gente que no tiene nada que
 * despejar todavía). El fundador delegó explícitamente los números de esta
 * decisión ("la decisión se la dejo a usted, tome la mejor") — valores
 * elegidos con una justificación concreta, no arbitraria, y documentados
 * como ajustables con evidencia real de uso, no como definitivos.
 */
const MIN_BUFFER_METERS = 150;
const MAX_BUFFER_METERS = 400;
/**
 * Segundos de reacción que se le da a un candidato para detectar la alerta
 * y despejar el paso — 8s es una cifra conservadora típica de "percibir +
 * decidir + maniobrar" en tránsito urbano (más que el tiempo de reacción
 * simple ante un evento visual, porque acá el candidato además tiene que
 * mover el vehículo). A 80km/h (22.2 m/s), 8s de margen ya llenan el techo
 * de 400m; a 20km/h o detenida, el mínimo de 150m es suficiente sin
 * sobre-alertar innecesariamente.
 */
const REACTION_TIME_SECONDS = 8;

/** Exportada (no solo interna) para que `SimulationEngineService` pueda reportar el mismo número real usado en la detección, en vez de adivinarlo — ver ADR-0022. */
export function dynamicBufferMeters(speedMetersPerSecond: number | null): number {
  if (speedMetersPerSecond === null || speedMetersPerSecond <= 0) return MIN_BUFFER_METERS;
  const grown = MIN_BUFFER_METERS + speedMetersPerSecond * REACTION_TIME_SECONDS;
  return Math.min(MAX_BUFFER_METERS, Math.round(grown));
}

/** Fracciones del buffer que separan `critical`/`warning`/`info` — ver el comentario de `CorridorSeverity`. */
const CRITICAL_BUFFER_FRACTION = 0.25;
const WARNING_BUFFER_FRACTION = 0.6;

function severityFor(distanceMeters: number, bufferMeters: number): CorridorSeverity {
  if (distanceMeters <= bufferMeters * CRITICAL_BUFFER_FRACTION) return "critical";
  if (distanceMeters <= bufferMeters * WARNING_BUFFER_FRACTION) return "warning";
  return "info";
}

/**
 * Cada cuántos METROS reales (no puntos crudos del polyline) se toma una
 * muestra hacia adelante. Antes se muestreaba cada N-ésimo punto del array
 * decodificado — funcionaba con una polyline densa (curvas/calles reales de
 * Google, muchos puntos), pero con pocos waypoints (ej. un tramo recto
 * corto) el muestreo por índice dejaba huecos reales sin cubrir en el
 * corredor: un candidato a mitad de ruta podía no aparecer NUNCA aunque
 * estuviera dentro del buffer, porque solo se consultaban los waypoints
 * originales, no puntos intermedios reales. Encontrado con el simulador
 * (Fase 7, ver ADR-0022), corregido a muestreo por distancia real
 * (`pointAtDistanceAlongPath`) — funciona igual sin importar cuántos
 * waypoints traiga la polyline de entrada.
 */
const SAMPLE_DISTANCE_METERS = 100;
/** Tope de muestras hacia adelante: cada muestra es una llamada real a Redis, así que se limita el costo por consulta. 20 muestras × 100m cubren 2km de corredor por delante de la ambulancia — suficiente para un primer slice urbano. */
const MAX_LOOKAHEAD_SAMPLES = 20;

/**
 * El "corredor" de una ambulancia ES su ruta activa (`RouteSessionService`,
 * ya construido en ADR-0011) — no se duplica esa noción. Este servicio solo
 * agrega la pregunta específica de Emergency Corridor: "¿qué otros usuarios
 * están dentro del buffer, mirando hacia adelante desde donde va la
 * ambulancia ahora?". Reusa `computeDeviation`'s misma idea (punto más
 * cercano de la ruta a la posición actual) para saber desde dónde empezar a
 * mirar hacia adelante.
 */
@Injectable()
export class EmergencyCorridorService {
  constructor(
    private readonly routeSession: RouteSessionService,
    private readonly locationState: LocationStateService,
  ) {}

  /**
   * `null` si la ambulancia no tiene una ruta activa (no arrancó ninguna
   * todavía, o ya llegó/canceló) — no es un error, es el estado normal
   * fuera de un traslado.
   */
  async findCandidates(ambulanceDriverId: string): Promise<CorridorCandidate[] | null> {
    const activeRoute = await this.routeSession.getActive(ambulanceDriverId);
    if (!activeRoute) return null;

    const currentLocation = await this.locationState.getCurrent(ambulanceDriverId);
    const currentPosition: LatLng = currentLocation
      ? { latitude: currentLocation.location.latitude, longitude: currentLocation.location.longitude }
      : activeRoute.origin;

    const bufferMeters = dynamicBufferMeters(currentLocation?.location.speed ?? null);

    const routePoints = decodePolyline(activeRoute.encodedPolyline);
    const samples = this.sampleAhead(routePoints, currentPosition);

    const nearest = new Map<string, number>();
    for (const point of samples) {
      const candidates = await this.locationState.findNearby(point, bufferMeters);
      for (const candidate of candidates) {
        if (candidate.userId === ambulanceDriverId) continue;
        const existing = nearest.get(candidate.userId);
        if (existing === undefined || candidate.distanceMeters < existing) {
          nearest.set(candidate.userId, candidate.distanceMeters);
        }
      }
    }

    return Array.from(nearest.entries()).map(([userId, distanceMeters]) => ({
      userId,
      distanceMeters: Math.round(distanceMeters),
      state: "potential_conflict" as const,
      severity: severityFor(distanceMeters, bufferMeters),
    }));
  }

  /**
   * Encuentra el waypoint de la ruta más cercano a la posición actual (mismo
   * cálculo que `route-deviation.ts`), convierte eso a una distancia
   * acumulada desde el inicio de la ruta, y muestrea puntos desde ahí hacia
   * adelante CADA `SAMPLE_DISTANCE_METERS` METROS REALES (no cada N-ésimo
   * punto crudo — ver el comentario de `SAMPLE_DISTANCE_METERS`), con un
   * tope de muestras.
   */
  private sampleAhead(routePoints: LatLng[], currentPosition: LatLng): LatLng[] {
    if (routePoints.length === 0) return [currentPosition];

    let nearestIndex = 0;
    let nearestDistance = Infinity;
    routePoints.forEach((point, index) => {
      const distance = haversineMeters(currentPosition, point);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });

    let cumulativeAtNearest = 0;
    for (let i = 1; i <= nearestIndex; i++) {
      cumulativeAtNearest += haversineMeters(routePoints[i - 1], routePoints[i]);
    }

    const sampled: LatLng[] = [];
    for (let i = 0; i < MAX_LOOKAHEAD_SAMPLES; i++) {
      const point = pointAtDistanceAlongPath(routePoints, cumulativeAtNearest + i * SAMPLE_DISTANCE_METERS);
      if (point === null) break;
      sampled.push(point);
    }
    return sampled.length > 0 ? sampled : [currentPosition];
  }
}
