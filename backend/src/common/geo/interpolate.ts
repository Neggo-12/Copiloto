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

/** Metros por grado de latitud — constante estándar, ya usada en varios escenarios sintéticos del proyecto para aproximaciones planas de corta distancia. */
const METERS_PER_DEGREE_LAT = 111_320;

/** Proyecta un punto a metros locales (x=este, y=norte) relativos a un punto de referencia — aproximación plana válida para distancias urbanas cortas (mismo criterio que el resto del proyecto). */
function toLocalMeters(point: LatLng, reference: LatLng): { x: number; y: number } {
  const metersPerDegreeLng = METERS_PER_DEGREE_LAT * Math.cos((reference.latitude * Math.PI) / 180);
  return {
    x: (point.longitude - reference.longitude) * metersPerDegreeLng,
    y: (point.latitude - reference.latitude) * METERS_PER_DEGREE_LAT,
  };
}

/** Distancia real de un punto al SEGMENTO (no solo a sus extremos) — proyección estándar punto-segmento en el plano local. */
function distanceToSegmentMeters(point: LatLng, segmentStart: LatLng, segmentEnd: LatLng): number {
  const p = toLocalMeters(point, segmentStart);
  const b = toLocalMeters(segmentEnd, segmentStart);
  const lengthSquared = b.x * b.x + b.y * b.y;
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, (p.x * b.x + p.y * b.y) / lengthSquared));
  const closest = { x: b.x * t, y: b.y * t };
  const dx = p.x - closest.x;
  const dy = p.y - closest.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Distancia real de un punto a una ruta poligonal completa — al SEGMENTO más
 * cercano, no al vértice más cercano (ver `computeDeviation` en
 * `route-session/route-deviation.ts`, que usaba solo distancia a vértices:
 * funcionaba razonablemente con un polyline denso de Google, pero con pocos
 * waypoints — ej. un tramo recto largo, o una ruta sintética de 2 puntos —
 * declaraba "fuera de ruta" a mitad de un tramo donde en realidad iba bien,
 * porque ambos extremos quedaban lejos aunque el punto estuviera justo
 * sobre la línea entre ellos. Encontrado con el simulador, escenario 4 —
 * ver ADR-0022; el propio comentario original de `computeDeviation` ya
 * marcaba la proyección punto-segmento como mejora diferida "si la
 * evidencia de uso real muestra que hace falta" — esta es esa evidencia).
 */
export function distanceToPathMeters(point: LatLng, routePoints: LatLng[]): number {
  if (routePoints.length === 0) return Infinity;
  if (routePoints.length === 1) return haversineMeters(point, routePoints[0]);

  let min = Infinity;
  for (let i = 1; i < routePoints.length; i++) {
    const distance = distanceToSegmentMeters(point, routePoints[i - 1], routePoints[i]);
    if (distance < min) min = distance;
  }
  return min;
}
