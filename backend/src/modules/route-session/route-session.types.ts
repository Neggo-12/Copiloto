import type { LatLng } from "../../common/geo/types";

/**
 * Ruta activa que un usuario está siguiendo — el mismo `encodedPolyline` que
 * devolvió `RoutingProvider.computeRoute()` en el momento en que arrancó el
 * viaje. Se guarda tal cual (sin decodificar) porque decodificar es barato
 * (ver `decodePolyline`) y así se evita duplicar el mismo array de puntos en
 * Redis además de la cadena original.
 */
export interface ActiveRouteSession {
  origin: LatLng;
  destination: LatLng;
  encodedPolyline: string;
  distanceMeters: number;
  durationSeconds: number;
  startedAt: number;
}
