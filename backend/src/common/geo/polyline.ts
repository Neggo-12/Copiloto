import type { LatLng } from "./types";

/**
 * Decodifica el "encoded polyline" que devuelve Google Routes API
 * (algoritmo estándar de Google, documentado en
 * https://developers.google.com/maps/documentation/utilities/polylinealgorithm).
 * Implementado directamente (sin dependencia nueva) — es ~20 líneas y evita
 * sumar un paquete para algo tan chico, consistente con "modular monolith,
 * mínimas dependencias".
 */
export function decodePolyline(encoded: string): LatLng[] {
  const points: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    result = 0;
    shift = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    points.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }

  return points;
}

/**
 * Codifica puntos al mismo formato "encoded polyline" de Google — algoritmo
 * inverso al de `decodePolyline`. No existía hasta ahora porque el único
 * productor de polylines era Google Routes API (ya vienen codificadas); el
 * primer consumidor real es `SimulationEngineService` (Fase 7 del roadmap,
 * ADR-0022), que construye rutas sintéticas y necesita guardarlas con el
 * MISMO formato que usa `ActiveRouteSession.encodedPolyline` en producción
 * — así el simulador ejercita el pipeline real (`RouteSessionService`,
 * `decodePolyline`, `EmergencyCorridorService`) en vez de una ruta paralela
 * de mentira.
 */
export function encodePolyline(points: LatLng[]): string {
  let output = "";
  let prevLat = 0;
  let prevLng = 0;
  for (const point of points) {
    const lat = Math.round(point.latitude * 1e5);
    const lng = Math.round(point.longitude * 1e5);
    output += encodeSignedValue(lat - prevLat) + encodeSignedValue(lng - prevLng);
    prevLat = lat;
    prevLng = lng;
  }
  return output;
}

function encodeSignedValue(value: number): string {
  let v = value < 0 ? ~(value << 1) : value << 1;
  let output = "";
  while (v >= 0x20) {
    output += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
    v >>= 5;
  }
  output += String.fromCharCode(v + 63);
  return output;
}
