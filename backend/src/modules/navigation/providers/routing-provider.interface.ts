/**
 * Contrato de routing, independiente del proveedor. Hoy lo implementa Google
 * Routes API (`google-routing.provider.ts`); mañana podría ser Mapbox/OSRM
 * sin que ningún caller de `RoutingProvider` se entere — solo cambia el
 * binding en `navigation.module.ts`.
 */
import type { LatLng } from "../../../common/geo/types";
export type { LatLng };

export type TravelMode = "DRIVE" | "WALK" | "BICYCLE" | "TWO_WHEELER";

export interface ComputeRouteInput {
  origin: LatLng;
  destination: LatLng;
  travelMode: TravelMode;
}

export interface ComputeRouteResult {
  distanceMeters: number;
  durationSeconds: number;
  encodedPolyline: string;
}

export const ROUTING_PROVIDER = Symbol("ROUTING_PROVIDER");

export interface RoutingProvider {
  computeRoute(input: ComputeRouteInput): Promise<ComputeRouteResult>;
}
