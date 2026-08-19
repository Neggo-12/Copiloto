import { Inject, Injectable } from "@nestjs/common";
import { GEOCODING_PROVIDER, type GeocodingProvider } from "../../navigation/providers/geocoding-provider.interface";
import { ROUTING_PROVIDER, type RoutingProvider } from "../../navigation/providers/routing-provider.interface";
import { LocationStateService } from "../../location/location-state.service";
import { RouteSessionService } from "../../route-session/route-session.service";
import { EmergencyVehiclesService } from "../../emergency/emergency-vehicles.service";
import type { AssistantTool, ToolExecutionContext, ToolOutcome } from "../assistant.types";

/**
 * La tool de mayor riesgo del registro — `requiresConfirmation = true`: un
 * "sí" mal interpretado por STT no debe arrancar un corredor de emergencia
 * real. Autorización real (no confiar en lo que diga el cliente/la voz):
 * `EmergencyVehiclesService.getStatusForDriver()`, igual que
 * `EmergencyCorridorController` — cualquier usuario no verificado recibe
 * `denied`, nunca llega a ejecutar nada.
 *
 * "Activar" ES arrancar la ruta activa (mismo concepto que
 * `POST /navigation/route-session`, ver ADR-0006/ADR-0012: "el corredor ES
 * la ruta activa de la ambulancia") — no se duplica un estado
 * "corredor activo" aparte.
 */
@Injectable()
export class ActivateEmergencyCorridorTool implements AssistantTool {
  name = "activate_emergency_corridor";
  description = "Activa el corredor de emergencia hacia un destino — SOLO para conductores de ambulancia verificados y activos.";
  requiresConfirmation = true;
  parameters = {
    type: "object" as const,
    properties: {
      destinationAddress: { type: "string", description: "Destino del traslado (hospital, dirección del incidente, etc.)." },
    },
    required: ["destinationAddress"],
  };

  constructor(
    @Inject(GEOCODING_PROVIDER) private readonly geocoding: GeocodingProvider,
    @Inject(ROUTING_PROVIDER) private readonly routing: RoutingProvider,
    private readonly locationState: LocationStateService,
    private readonly routeSession: RouteSessionService,
    private readonly vehicles: EmergencyVehiclesService,
  ) {}

  async execute(ctx: ToolExecutionContext, args: Record<string, unknown>): Promise<ToolOutcome> {
    const status = await this.vehicles.getStatusForDriver(ctx.userId);
    if (!status?.verified || !status.active) {
      return { status: "denied", reason: "Solo conductores de ambulancia verificados y activos pueden activar el corredor de emergencia." };
    }

    const destinationAddress = typeof args.destinationAddress === "string" ? args.destinationAddress.trim() : "";
    if (!destinationAddress) {
      return { status: "error", message: "Necesito el destino del traslado." };
    }

    if (!ctx.confirmed) {
      return { status: "needs_confirmation", summary: `Vas a activar el corredor de emergencia hacia "${destinationAddress}". ¿Confirmas?` };
    }

    const current = await this.locationState.getCurrent(ctx.userId);
    if (!current) {
      return { status: "error", message: "No tengo tu ubicación actual — necesito al menos un reporte de GPS antes de activar." };
    }

    const geocoded = await this.geocoding.geocode(destinationAddress);
    if (!geocoded) {
      return { status: "error", message: `No encontré "${destinationAddress}".` };
    }

    const origin = { latitude: current.location.latitude, longitude: current.location.longitude };
    const route = await this.routing.computeRoute({ origin, destination: geocoded.location, travelMode: "DRIVE" });

    await this.routeSession.start(ctx.userId, {
      origin,
      destination: geocoded.location,
      encodedPolyline: route.encodedPolyline,
      distanceMeters: route.distanceMeters,
      durationSeconds: route.durationSeconds,
      startedAt: Date.now(),
    });

    return {
      status: "ok",
      data: {
        destination: geocoded.formattedAddress,
        distanceMeters: route.distanceMeters,
        durationSeconds: route.durationSeconds,
      },
    };
  }
}
