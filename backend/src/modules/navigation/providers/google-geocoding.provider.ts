import { BadGatewayException, Inject, Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { GOOGLE_MAPS_API_KEY } from "../../../common/google-maps/google-maps.module";
import type { LatLng } from "./routing-provider.interface";
import type { GeocodeResult, GeocodingProvider } from "./geocoding-provider.interface";

const GEOCODING_API_ENDPOINT = "https://maps.googleapis.com/maps/api/geocode/json";

interface GoogleLatLng {
  lat: number;
  lng: number;
}

interface GoogleGeocodeResponse {
  status: string;
  results: Array<{
    formatted_address: string;
    place_id: string;
    geometry: {
      location: GoogleLatLng;
      // Campos reales verificados contra la referencia oficial
      // (https://developers.google.com/maps/documentation/geocoding/guides-v3/requests-geocoding,
      // consultada 2026-08-31) — `location_type` solo es "ROOFTOP" para una
      // dirección puntual precisa; para un barrio/sector, Google devuelve
      // "GEOMETRIC_CENTER" o "APPROXIMATE" junto con un `viewport` real
      // (el rectángulo lat/lng que cubre esa área) — se usa para estimar un
      // radio de geofence realista en vez del fijo de 300m (ver `request`).
      location_type: "ROOFTOP" | "RANGE_INTERPOLATED" | "GEOMETRIC_CENTER" | "APPROXIMATE";
      viewport?: { northeast: GoogleLatLng; southwest: GoogleLatLng };
    };
  }>;
}

/** Radio mínimo/máximo real para el geofence sugerido — nunca más chico que el default actual (300m) ni tan grande que cubra sin querer una ciudad completa. */
const MIN_SUGGESTED_RADIUS_METERS = 300;
const MAX_SUGGESTED_RADIUS_METERS = 1500;
const EARTH_RADIUS_METERS = 6371000;

/** Distancia real entre dos puntos lat/lng (fórmula de Haversine, estándar — no una aproximación inventada). */
function haversineMeters(a: GoogleLatLng, b: GoogleLatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h));
}

/**
 * Bug real reportado 2026-08-31 por el fundador: pedir "avísame cuando esté
 * cerca de Buenos Aires" (un barrio, no una dirección puntual) usaba el
 * radio fijo de 300m de `LocationRemindersService` alrededor de UN SOLO
 * punto — quedándose corto para el tamaño real del barrio, así que el
 * fundador podía estar genuinamente cerca/dentro del barrio y el geofence
 * nunca disparaba. Un radio fijo solo tiene sentido para un punto (una
 * dirección exacta, `location_type: "ROOFTOP"`); para un área real
 * (`GEOMETRIC_CENTER`/`APPROXIMATE`, con `viewport`), se estima un radio a
 * partir del tamaño real de esa área (distancia del centro a la esquina del
 * viewport), acotado entre 300m y 1500m para no terminar cubriendo sin
 * querer una ciudad completa.
 */
function suggestRadiusMeters(
  location: GoogleLatLng,
  locationType: string,
  viewport: { northeast: GoogleLatLng; southwest: GoogleLatLng } | undefined,
): number | undefined {
  if (locationType === "ROOFTOP" || !viewport) return undefined;
  const halfDiagonal = haversineMeters(location, viewport.northeast);
  return Math.min(MAX_SUGGESTED_RADIUS_METERS, Math.max(MIN_SUGGESTED_RADIUS_METERS, Math.round(halfDiagonal)));
}

/**
 * Medio grado de latitud/longitud ≈ 55km — suficiente para cubrir el Valle
 * de Aburrá completo (Medellín y sus municipios vecinos) como sesgo de
 * `bounds`, sin ser tan angosto que excluya un resultado válido cerca del
 * borde. Ver `boundsAround`.
 */
const BOUNDS_HALF_DEGREES = 0.5;

/** `bounds=sur,oeste|norte,este` alrededor de `near` — sesgo SUAVE hacia esa zona (formato verificado contra la referencia oficial, ver comentario de clase). */
function boundsAround(near: LatLng): string {
  const south = near.latitude - BOUNDS_HALF_DEGREES;
  const north = near.latitude + BOUNDS_HALF_DEGREES;
  const west = near.longitude - BOUNDS_HALF_DEGREES;
  const east = near.longitude + BOUNDS_HALF_DEGREES;
  return `${south},${west}|${north},${east}`;
}

/**
 * Implementación real de `GeocodingProvider` contra Google Geocoding API
 * (verificado contra la referencia oficial el 2026-08-19, el 2026-08-31
 * para `location_type`/`viewport`, y de nuevo 2026-08-31 para `region`/
 * `bounds`/`components`:
 * https://developers.google.com/maps/documentation/geocoding/guides-v3/requests-geocoding).
 * `status: "ZERO_RESULTS"` es un caso válido (no un error) — se devuelve
 * `null`, no se lanza excepción.
 *
 * Bug real reportado 2026-08-31 por el fundador: sin ningún sesgo de
 * ubicación, pedir "Belén" (para un recordatorio en Medellín) devolvía
 * Bethlehem (Medio Oriente) — mismo nombre en español — y "Buenos Aires"
 * devolvía la capital de Argentina en vez del barrio de Medellín. Fix en
 * dos capas:
 * 1. `components=country:CO` — filtro DURO (no solo sesgo) a resultados
 *    dentro de Colombia, siempre. La plataforma completa (Medellín,
 *    Valle de Aburrá, ADR-0001 en adelante) solo opera en Colombia, así
 *    que un resultado de otro país NUNCA es el correcto aquí.
 * 2. `bounds` alrededor de `near` (la ubicación real conocida del
 *    usuario, ver `LocationStateService`) — sesgo SUAVE adicional hacia
 *    el sector donde el usuario realmente está, para desempatar entre
 *    varios lugares con nombres parecidos dentro del mismo país.
 */
@Injectable()
export class GoogleGeocodingProvider implements GeocodingProvider {
  private readonly logger = new Logger(GoogleGeocodingProvider.name);

  constructor(@Inject(GOOGLE_MAPS_API_KEY) private readonly apiKey: string | undefined) {}

  async geocode(address: string, near?: LatLng): Promise<GeocodeResult | null> {
    return this.request({
      address,
      region: "co",
      components: "country:CO",
      ...(near ? { bounds: boundsAround(near) } : {}),
    });
  }

  async reverseGeocode(location: LatLng): Promise<GeocodeResult | null> {
    return this.request({ latlng: `${location.latitude},${location.longitude}` });
  }

  private async request(params: Record<string, string>): Promise<GeocodeResult | null> {
    if (!this.apiKey) {
      throw new ServiceUnavailableException(
        "GOOGLE_MAPS_API_KEY no está configurada — geocoding no disponible todavía.",
      );
    }

    const url = new URL(GEOCODING_API_ENDPOINT);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
    url.searchParams.set("key", this.apiKey);

    const response = await fetch(url.toString());
    if (!response.ok) {
      this.logger.error(`Geocoding API respondió HTTP ${response.status}`);
      throw new BadGatewayException("No se pudo geocodificar con Google Geocoding API.");
    }

    const data = (await response.json()) as GoogleGeocodeResponse;
    if (data.status === "ZERO_RESULTS") {
      return null;
    }
    if (data.status !== "OK") {
      this.logger.error(`Geocoding API devolvió status ${data.status}`);
      throw new BadGatewayException(`Google Geocoding API devolvió status ${data.status}.`);
    }

    const result = data.results[0];
    return {
      formattedAddress: result.formatted_address,
      placeId: result.place_id,
      location: { latitude: result.geometry.location.lat, longitude: result.geometry.location.lng },
      suggestedRadiusMeters: suggestRadiusMeters(
        result.geometry.location,
        result.geometry.location_type,
        result.geometry.viewport,
      ),
    };
  }
}
