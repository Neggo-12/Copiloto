import { Inject, Injectable } from "@nestjs/common";
import { GEOCODING_PROVIDER, type GeocodingProvider } from "../../navigation/providers/geocoding-provider.interface";
import { ROUTING_PROVIDER, type RoutingProvider } from "../../navigation/providers/routing-provider.interface";
import { LocationStateService } from "../../location/location-state.service";
import { DrivingModeService } from "../../vehicles/driving-mode.service";
import type { AssistantTool, ToolExecutionContext, ToolOutcome } from "../assistant.types";
import { travelModeFromDrivingMode } from "./travel-mode";

/**
 * Solo lectura — no arranca una ruta activa (eso es
 * `POST /navigation/route-session`, un paso deliberadamente separado y
 * explícito). El origen es siempre la última ubicación real del usuario
 * (Location Engine), nunca algo que la IA pueda inventar. El modo de viaje
 * se toma del Modo de manejo actual (ADR-0014) si el usuario lo fijó, para
 * no preguntarle dos veces "¿carro o moto?" en la misma conversación.
 */
@Injectable()
export class CalculateRouteTool implements AssistantTool {
  name = "calculate_route";
  description = "Calcula distancia y tiempo estimado desde la ubicación actual del usuario hasta un destino.";
  requiresConfirmation = false;
  parameters = {
    type: "object" as const,
    properties: {
      destinationAddress: { type: "string", description: "Dirección o lugar de destino." },
    },
    required: ["destinationAddress"],
  };

  constructor(
    @Inject(GEOCODING_PROVIDER) private readonly geocoding: GeocodingProvider,
    @Inject(ROUTING_PROVIDER) private readonly routing: RoutingProvider,
    private readonly locationState: LocationStateService,
    private readonly drivingMode: DrivingModeService,
  ) {}

  async execute(ctx: ToolExecutionContext, args: Record<string, unknown>): Promise<ToolOutcome> {
    const destinationAddress = typeof args.destinationAddress === "string" ? args.destinationAddress.trim() : "";
    if (!destinationAddress) {
      return { status: "error", message: "Necesito saber a dónde quieres ir." };
    }

    const current = await this.locationState.getCurrent(ctx.userId);
    if (!current) {
      return { status: "error", message: "Todavía no tengo tu ubicación actual — necesito al menos un reporte de GPS." };
    }

    const geocoded = await this.geocoding.geocode(destinationAddress);
    if (!geocoded) {
      return { status: "error", message: `No encontré "${destinationAddress}".` };
    }

    const mode = await this.drivingMode.get(ctx.userId);
    const travelMode = travelModeFromDrivingMode(mode);

    const route = await this.routing.computeRoute({
      origin: { latitude: current.location.latitude, longitude: current.location.longitude },
      destination: geocoded.location,
      travelMode,
    });

    return {
      status: "ok",
      data: {
        destination: geocoded.formattedAddress,
        distanceMeters: route.distanceMeters,
        durationSeconds: route.durationSeconds,
        travelMode,
      },
    };
  }
}
