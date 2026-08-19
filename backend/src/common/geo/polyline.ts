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
