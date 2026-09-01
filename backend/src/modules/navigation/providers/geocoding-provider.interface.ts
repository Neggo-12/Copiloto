import type { LatLng } from "./routing-provider.interface";

export interface GeocodeResult {
  formattedAddress: string;
  location: LatLng;
  placeId: string;
  /**
   * Radio (metros) sugerido para un geofence alrededor de `location`, SOLO
   * cuando el provider puede estimarlo a partir del tamaño real del área
   * geocodificada (ej. un barrio) — `undefined` si no aplica (ej. una
   * dirección puntual tipo ROOFTOP, donde un radio fijo pequeño ya es
   * correcto). Real gap encontrado 2026-08-31: pedir un recordatorio para
   * un barrio completo ("cerca de Buenos Aires") con el radio fijo de 300m
   * que usa hoy `LocationRemindersService` deja fuera partes reales del
   * barrio — un radio fijo nunca es correcto para un área, solo para un
   * punto. Ver `GoogleGeocodingProvider` para cómo se calcula.
   */
  suggestedRadiusMeters?: number;
}

export const GEOCODING_PROVIDER = Symbol("GEOCODING_PROVIDER");

export interface GeocodingProvider {
  /**
   * `near`, si se manda, es la ubicación real conocida del usuario (ver
   * `LocationStateService.getCurrent()`) — el provider la usa para sesgar
   * el resultado hacia ahí. Bug real reportado 2026-08-31 por el fundador:
   * sin ningún sesgo, pedir "Belén" devolvía Bethlehem (Medio Oriente) y
   * "Buenos Aires" devolvía la capital de Argentina, en vez de los barrios
   * reales de Medellín — nombres de lugar comunes en varios países/
   * continentes, y Google por defecto no tiene forma de saber que este
   * usuario está en Colombia sin decírselo. Ver `GoogleGeocodingProvider`.
   */
  geocode(address: string, near?: LatLng): Promise<GeocodeResult | null>;
  reverseGeocode(location: LatLng): Promise<GeocodeResult | null>;
}
