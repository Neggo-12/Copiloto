import { Inject, Injectable } from "@nestjs/common";
import { GEOCODING_PROVIDER, type GeocodingProvider } from "../../navigation/providers/geocoding-provider.interface";
import { LocationStateService } from "../../location/location-state.service";
import { DrivingModeService } from "../../vehicles/driving-mode.service";
import type { AssistantTool, ToolExecutionContext, ToolOutcome } from "../assistant.types";
import { travelModeFromDrivingMode } from "./travel-mode";

/**
 * Bug real reportado 2026-09-02 por el fundador probando en la calle:
 * `calculate_route` (solo lectura, ver su comentario de clase) nunca abrió
 * nada — es correcto que no lo haga sola — pero el asistente igual
 * respondía "he calculado la ruta, deberías poder verla en Google Maps" sin
 * haber hecho nada real. Esta tool es la acción real que faltaba: genera un
 * link real de Google Maps (formato oficial de "Maps URLs", verificado
 * contra developers.google.com/maps/documentation/urls/get-started el
 * 2026-09-02 — `travelmode` acepta `driving`/`two-wheeler` entre otros, así
 * que el mismo mapeo de `travelModeFromDrivingMode` que ya usa
 * `calculate_route` sirve tal cual) y el resultado viaja de vuelta al
 * navegador vía `GeminiLiveCallbacks.onToolResult` →
 * `AssistantVoiceGateway` → evento `voice:tool-result` — el navegador es
 * quien de verdad abre el link (`window.open`), esta tool nunca podría
 * abrir nada por sí sola desde el backend.
 *
 * Sin confirmación explícita en el tool schema (`requiresConfirmation:
 * false`) — el system prompt (ver `gemini-live.service.ts`) instruye al
 * modelo a llamar esta tool SOLO después de que el usuario ya haya dicho
 * que sí quiere ver/abrir la ruta en la conversación; abrir un link no es
 * una acción destructiva ni cara (mismo criterio de bajo riesgo/reversible
 * que ya usa `create_location_reminder`).
 */
@Injectable()
export class OpenNavigationTool implements AssistantTool {
  name = "open_navigation";
  description =
    "Abre la ruta real en Google Maps en el teléfono del usuario. Llámala SOLO después de que el usuario ya haya confirmado en la conversación que quiere ver/abrir la ruta (por ejemplo dijo que sí a '¿quieres que te muestre la ruta?').";
  requiresConfirmation = false;
  parameters = {
    type: "object" as const,
    properties: {
      destinationAddress: { type: "string", description: "Dirección o lugar de destino, el mismo que ya se usó (o se hubiera usado) con calculate_route." },
    },
    required: ["destinationAddress"],
  };

  constructor(
    @Inject(GEOCODING_PROVIDER) private readonly geocoding: GeocodingProvider,
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

    const geocoded = await this.geocoding.geocode(destinationAddress, current.location);
    if (!geocoded) {
      return { status: "error", message: `No encontré "${destinationAddress}".` };
    }

    const mode = await this.drivingMode.get(ctx.userId);
    const travelMode = travelModeFromDrivingMode(mode) === "TWO_WHEELER" ? "two-wheeler" : "driving";

    const mapsUrl = new URL("https://www.google.com/maps/dir/");
    mapsUrl.searchParams.set("api", "1");
    mapsUrl.searchParams.set("origin", `${current.location.latitude},${current.location.longitude}`);
    mapsUrl.searchParams.set("destination", `${geocoded.location.latitude},${geocoded.location.longitude}`);
    mapsUrl.searchParams.set("travelmode", travelMode);

    return {
      status: "ok",
      data: {
        destination: geocoded.formattedAddress,
        mapsUrl: mapsUrl.toString(),
      },
    };
  }
}
