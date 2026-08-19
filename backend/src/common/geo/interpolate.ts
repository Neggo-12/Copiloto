import { haversineMeters } from "./haversine";
import type { LatLng } from "./types";

/**
 * Punto sobre una ruta poligonal a una distancia acumulada dada desde el
 * primer punto, interpolando linealmente dentro del segmento correspondiente.
 * `null` si `distanceMeters` excede el largo total de la ruta (ya no hay
 * "más ruta" que interpolar) o es negativo.
 *
 * Compartido por `EmergencyCorridorService.sampleAhead` (muestrear hacia
 * adelante por DISTANCIA real, no por índice de punto crudo — ver ADR-0022:
 * samplear por índice asumía una densidad de puntos que una polyline con
 * pocos waypoints no tiene, dejando huecos reales sin cubrir en el
 * corredor; encontrado por el simulador, Fase 7) y por
 * `SimulationEngineService` (mover un vehículo virtual a lo largo de su
 * ruta a velocidad constante).
 */
export function pointAtDistanceAlongPath(points: LatLng[], distanceMeters: number): LatLng | null {
  if (distanceMeters < 0 || points.length === 0) return null;
  if (points.length === 1) return distanceMeters === 0 ? points[0] : null;

  let remaining = distanceMeters;
  for (let i = 1; i < points.length; i++) {
    const segmentStart = points[i - 1];
    const segmentEnd = points[i];
    const segmentLength = haversineMeters(segmentStart, segmentEnd);

    if (remaining <= segmentLength) {
      const fraction = segmentLength === 0 ? 0 : remaining / segmentLength;
      return {
        latitude: segmentStart.latitude + (segmentEnd.latitude - segmentStart.latitude) * fraction,
        longitude: segmentStart.longitude + (segmentEnd.longitude - segmentStart.longitude) * fraction,
      };
    }
    remaining -= segmentLength;
  }
  return null;
}

/** Largo total de una ruta poligonal — suma de distancias reales entre waypoints consecutivos. */
export function pathLengthMeters(points: LatLng[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += haversineMeters(points[i - 1], points[i]);
  }
  return total;
}
