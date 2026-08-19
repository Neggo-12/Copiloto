import { Injectable } from "@nestjs/common";
import { haversineMeters } from "../../common/geo/haversine";
import { decodePolyline } from "../../common/geo/polyline";
import type { LatLng } from "../../common/geo/types";
import { LocationStateService } from "../location/location-state.service";
import { RouteSessionService } from "../route-session/route-session.service";
import type { CorridorCandidate } from "./emergency-corridor.types";

/**
 * Radio del buffer alrededor del corredor. Fijo para este primer slice — el
 * buffer "dinámico" (más ancho a mayor velocidad de la ambulancia, de la
 * visión completa del fundador) queda para una siguiente rebanada, cuando
 * haya evidencia real de que el fijo se queda corto o sobra.
 */
const CORRIDOR_BUFFER_METERS = 200;
/** Cada cuántos puntos decodificados del polyline se muestrea — evita una búsqueda geoespacial por cada uno de los ~100+ puntos de una ruta típica. */
const SAMPLE_STRIDE = 5;
/** Tope de muestras hacia adelante: cada muestra es una llamada real a Redis, así que se limita el costo por consulta. ~20 muestras cada ~100-250m cubren varios km de corredor por delante de la ambulancia — suficiente para un primer slice urbano. */
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

    const routePoints = decodePolyline(activeRoute.encodedPolyline);
    const samples = this.sampleAhead(routePoints, currentPosition);

    const nearest = new Map<string, number>();
    for (const point of samples) {
      const candidates = await this.locationState.findNearby(point, CORRIDOR_BUFFER_METERS);
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
    }));
  }

  /**
   * Encuentra el punto de la ruta más cercano a la posición actual (mismo
   * cálculo que `route-deviation.ts`) y muestrea puntos desde ahí hacia
   * adelante, con un tope de muestras.
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

    const ahead = routePoints.slice(nearestIndex);
    const sampled: LatLng[] = [];
    for (let i = 0; i < ahead.length && sampled.length < MAX_LOOKAHEAD_SAMPLES; i += SAMPLE_STRIDE) {
      sampled.push(ahead[i]);
    }
    return sampled.length > 0 ? sampled : [currentPosition];
  }
}
