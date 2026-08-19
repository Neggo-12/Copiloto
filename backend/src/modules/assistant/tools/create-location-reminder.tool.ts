import { Inject, Injectable } from "@nestjs/common";
import { GEOCODING_PROVIDER, type GeocodingProvider } from "../../navigation/providers/geocoding-provider.interface";
import { LocationRemindersService } from "../../location-reminders/location-reminders.service";
import type { AssistantTool, ToolExecutionContext, ToolOutcome } from "../assistant.types";

/**
 * Ejemplo real del founder: "avísame cuando pase por Belén de comprar los
 * panes". El tool recibe una dirección de texto (lo que dice el usuario en
 * voz), la resuelve con el mismo `GeocodingProvider` que ya usa
 * `GET /navigation/geocode` (ADR-0010), y crea el recordatorio con las
 * coordenadas reales — exactamente el flujo de dos pasos que ya anticipaba
 * ADR-0015. No requiere confirmación: es una acción de bajo riesgo y
 * reversible (`DELETE /location-reminders/:id`).
 */
@Injectable()
export class CreateLocationReminderTool implements AssistantTool {
  name = "create_location_reminder";
  description = "Crea un recordatorio que se dispara cuando el usuario pasa cerca de una dirección o sector.";
  requiresConfirmation = false;
  parameters = {
    type: "object" as const,
    properties: {
      address: { type: "string", description: "Dirección o sector, ej. 'Belén, Medellín'." },
      message: { type: "string", description: "Qué debe recordarle el asistente, ej. 'comprar los panes'." },
      radiusMeters: { type: "number", description: "Radio del geofence en metros (opcional, default 300)." },
    },
    required: ["address", "message"],
  };

  constructor(
    @Inject(GEOCODING_PROVIDER) private readonly geocoding: GeocodingProvider,
    private readonly reminders: LocationRemindersService,
  ) {}

  async execute(ctx: ToolExecutionContext, args: Record<string, unknown>): Promise<ToolOutcome> {
    const address = typeof args.address === "string" ? args.address.trim() : "";
    const message = typeof args.message === "string" ? args.message.trim() : "";
    const radiusMeters = typeof args.radiusMeters === "number" ? args.radiusMeters : undefined;

    if (!address || !message) {
      return { status: "error", message: "Necesito una dirección y qué quieres que te recuerde." };
    }
    if (radiusMeters !== undefined && radiusMeters <= 0) {
      return { status: "error", message: "El radio debe ser un número positivo." };
    }

    const geocoded = await this.geocoding.geocode(address);
    if (!geocoded) {
      return { status: "error", message: `No encontré la dirección "${address}".` };
    }

    const reminder = await this.reminders.create(
      ctx.userId,
      message,
      geocoded.location.latitude,
      geocoded.location.longitude,
      radiusMeters,
      geocoded.formattedAddress,
    );

    return {
      status: "ok",
      data: {
        id: reminder.id,
        message: reminder.message,
        resolvedAddress: geocoded.formattedAddress,
        radiusMeters: reminder.radiusMeters,
      },
    };
  }
}
