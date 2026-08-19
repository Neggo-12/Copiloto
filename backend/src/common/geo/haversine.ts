import type { LatLng } from "./types";

/**
 * Distancia real (gran círculo) entre dos coordenadas — antes vivía
 * duplicada dentro de `location-normalizer.ts` (detección de saltos
 * implausibles); se centraliza aquí porque `route-deviation.ts` la necesita
 * también, para el mismo tipo de cálculo (distancia real entre puntos).
 */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const sinDLat = Math.sin(dLat / 2) ** 2;
  const sinDLon = Math.sin(dLon / 2) ** 2;
  const h = sinDLat + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * sinDLon;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
