import { haversineMeters } from "../../common/geo/haversine";
import type { LatLng } from "../../common/geo/types";

/**
 * Margen antes de considerar que el usuario se salió de la ruta. 60m cubre
 * el error típico de GPS urbano (10-30m) más el espaciado normal entre
 * puntos consecutivos del polyline de Google — sin ser tan ancho que deje
 * pasar desvíos reales (girar en la calle equivocada).
 */
const OFF_ROUTE_THRESHOLD_METERS = 60;

export interface DeviationResult {
  distanceMeters: number;
  offRoute: boolean;
}

/**
 * Distancia del punto actual al punto MÁS CERCANO de la ruta (no proyección
 * punto-segmento). Es una aproximación deliberada, no la versión más precisa
 * posible: el polyline de Google Routes viene con puntos densamente
 * muestreados a lo largo de la vía, así que la distancia al vértice más
 * cercano ya es una buena señal en la práctica. Proyección punto-segmento
 * (más exacta, más costosa) queda como refinamiento futuro si la evidencia
 * de uso real muestra que hace falta — no se construye ahora sin esa
 * evidencia.
 */
export function computeDeviation(current: LatLng, routePoints: LatLng[]): DeviationResult {
  if (routePoints.length === 0) {
    return { distanceMeters: Infinity, offRoute: true };
  }

  let min = Infinity;
  for (const point of routePoints) {
    const distance = haversineMeters(current, point);
    if (distance < min) min = distance;
  }

  return { distanceMeters: min, offRoute: min > OFF_ROUTE_THRESHOLD_METERS };
}
