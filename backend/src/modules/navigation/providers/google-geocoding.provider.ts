import { BadGatewayException, Inject, Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { GOOGLE_MAPS_API_KEY } from "../../../common/google-maps/google-maps.module";
import type { LatLng } from "./routing-provider.interface";
import type { GeocodeResult, GeocodingProvider } from "./geocoding-provider.interface";

const GEOCODING_API_ENDPOINT = "https://maps.googleapis.com/maps/api/geocode/json";

interface GoogleGeocodeResponse {
  status: string;
  results: Array<{
    formatted_address: string;
    place_id: string;
    geometry: { location: { lat: number; lng: number } };
  }>;
}

/**
 * Implementación real de `GeocodingProvider` contra Google Geocoding API
 * (verificado contra la referencia oficial el 2026-08-19:
 * https://developers.google.com/maps/documentation/geocoding/requests-geocoding).
 * `status: "ZERO_RESULTS"` es un caso válido (no un error) — se devuelve
 * `null`, no se lanza excepción.
 */
@Injectable()
export class GoogleGeocodingProvider implements GeocodingProvider {
  private readonly logger = new Logger(GoogleGeocodingProvider.name);

  constructor(@Inject(GOOGLE_MAPS_API_KEY) private readonly apiKey: string | undefined) {}

  async geocode(address: string): Promise<GeocodeResult | null> {
    return this.request({ address });
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
    };
  }
}
