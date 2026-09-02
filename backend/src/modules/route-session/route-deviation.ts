import { distanceToPathMeters } from "../../common/geo/interpolate";
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
 * Distancia real del punto actual al SEGMENTO más cercano de la ruta
 * (proyección punto-segmento, `distanceToPathMeters`) — no solo a sus
 * vértices. Antes se medía solo distancia a vértices: con el polyline
 * denso de Google Routes eso era una buena aproximación en la práctica,
 * pero con pocos waypoints (un tramo recto largo, o una ruta sintética de
 * 2 puntos) declaraba "fuera de ruta" a mitad de un tramo donde en
 * realidad se iba bien, porque ambos extremos quedaban lejos aunque el
 * punto estuviera justo sobre la línea entre ellos. Corregido con
 * evidencia real del simulador (escenario 4, Fase 4 — ver ADR-0022), no
 * como refinamiento especulativo.
 */
export function computeDeviation(current: LatLng, routePoints: LatLng[]): DeviationResult {
  if (routePoints.length === 0) {
    return { distanceMeters: Infinity, offRoute: true };
  }

  const distanceMeters = distanceToPathMeters(current, routePoints);
  return { distanceMeters, offRoute: distanceMeters > OFF_ROUTE_THRESHOLD_METERS };
}
