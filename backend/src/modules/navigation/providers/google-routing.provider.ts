import { BadGatewayException, Inject, Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { GOOGLE_MAPS_API_KEY } from "../../../common/google-maps/google-maps.module";
import type { ComputeRouteInput, ComputeRouteResult, RoutingProvider } from "./routing-provider.interface";

const ROUTES_API_ENDPOINT = "https://routes.googleapis.com/directions/v2:computeRoutes";

/**
 * Implementación real de `RoutingProvider` contra Google Routes API
 * (`computeRoutes`, verificado contra la referencia oficial el 2026-08-19:
 * https://developers.google.com/maps/documentation/routes/reference/rest/v2/TopLevel/computeRoutes).
 *
 * El `X-Goog-FieldMask` es obligatorio según la doc oficial (la API lo
 * rechaza sin esto) — se pide solo lo que se usa, para minimizar costo.
 */
@Injectable()
export class GoogleRoutingProvider implements RoutingProvider {
  private readonly logger = new Logger(GoogleRoutingProvider.name);

  constructor(@Inject(GOOGLE_MAPS_API_KEY) private readonly apiKey: string | undefined) {}

  async computeRoute(input: ComputeRouteInput): Promise<ComputeRouteResult> {
    if (!this.apiKey) {
      throw new ServiceUnavailableException(
        "GOOGLE_MAPS_API_KEY no está configurada — routing no disponible todavía.",
      );
    }

    const response = await fetch(ROUTES_API_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": this.apiKey,
        "X-Goog-FieldMask": "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline",
      },
      body: JSON.stringify({
        origin: { location: { latLng: input.origin } },
        destination: { location: { latLng: input.destination } },
        travelMode: input.travelMode,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      this.logger.error(`Routes API respondió ${response.status}: ${errorBody}`);
      throw new BadGatewayException("No se pudo calcular la ruta con Google Routes API.");
    }

    const data = (await response.json()) as {
      routes?: Array<{ distanceMeters: number; duration: string; polyline: { encodedPolyline: string } }>;
    };
    const route = data.routes?.[0];
    if (!route) {
      throw new BadGatewayException("Google Routes API no devolvió ninguna ruta.");
    }

    return {
      distanceMeters: route.distanceMeters,
      durationSeconds: Number(route.duration.replace("s", "")),
      encodedPolyline: route.polyline.encodedPolyline,
    };
  }
}
