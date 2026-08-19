import type { LatLng } from "./routing-provider.interface";

export interface GeocodeResult {
  formattedAddress: string;
  location: LatLng;
  placeId: string;
}

export const GEOCODING_PROVIDER = Symbol("GEOCODING_PROVIDER");

export interface GeocodingProvider {
  geocode(address: string): Promise<GeocodeResult | null>;
  reverseGeocode(location: LatLng): Promise<GeocodeResult | null>;
}
