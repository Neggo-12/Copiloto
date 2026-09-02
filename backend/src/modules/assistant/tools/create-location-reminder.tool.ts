import { Inject, Injectable } from "@nestjs/common";
import { GEOCODING_PROVIDER, type GeocodingProvider } from "../../navigation/providers/geocoding-provider.interface";
import { LocationStateService } from "../../location/location-state.service";
import { LocationRemindersService } from "../../location-reminders/location-reminders.service";
import { ReminderCacheService } from "../../location-reminders/reminder-cache.service";
import type { AssistantTool, ToolExecutionContext, ToolOutcome } from "../assistant.types";

/**
 * Ejemplo real del founder: "avísame cuando pase por Belén de comprar los
 * panes". El tool recibe una dirección de texto (lo que dice el usuario en
 * voz), la resuelve con el mismo `GeocodingProvider` que ya usa
 * `GET /navigation/geocode` (ADR-0010), y crea el recordatorio con las
 * coordenadas reales — exactamente el flujo de dos pasos que ya anticipaba
 * ADR-0015. No requiere confirmación: es una acción de bajo riesgo y
 * reversible (`DELETE /location-reminders/:id`).
 *
 * Bug real reportado 2026-09-02 (el fundador manejando, creó "comprar unas
 * pulpas" por voz, pasó a ~100m del punto y nunca sonó nada): esta tool
 * llamaba `LocationRemindersService.create()` directo, sin pasar por
 * `LocationRemindersController.create()` — que es el único lugar que
 * invalidaba `ReminderCacheService` tras crear un recordatorio de ubicación
 * (ver su comentario real ahí). `GeofenceTriggerService.checkAndTrigger()`
 * evalúa la proximidad contra esa caché de Redis (TTL de 24h, se autocorrige
 * sola pero no de inmediato) — si ya estaba poblada por un `location:update`
 * anterior (el caso real: el fundador ya llevaba el rastreo activo antes de
 * crear el recordatorio por voz), el geofence seguía evaluando la lista
 * VIEJA, sin el recordatorio recién creado, por hasta 24h. El recordatorio sí
 * quedaba bien guardado en Postgres (por eso se veía "Activo" en la UI) — el
 * bug era puramente de caché desincronizada. Fix: mismo `cache.invalidate()`
 * que ya usa el controller, ahora también aquí.
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
    private readonly locationState: LocationStateService,
    private readonly cache: ReminderCacheService,
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

    // Bug real reportado 2026-08-31: sin sesgo de ubicación, "Belén"
    // devolvía Bethlehem (Medio Oriente) y "Buenos Aires" devolvía la
    // capital de Argentina, en vez de los barrios reales de Medellín —
    // nombres de lugar comunes en varios países. `GoogleGeocodingProvider`
    // ya filtra siempre a Colombia (`components=country:CO`); aquí además
    // se manda la ubicación real conocida del usuario (si existe) como
    // sesgo adicional dentro del país, exactamente lo que pidió el
    // fundador: "la app debe pedir mi ubicación en tiempo real para que
    // funcione muy bien". Si no hay ubicación reportada todavía (nunca se
    // conectó por WebSocket), se sigue geocodificando sin ese sesgo extra
    // — el filtro por país ya cubre el bug reportado.
    const current = await this.locationState.getCurrent(ctx.userId);
    const near = current ? { latitude: current.location.latitude, longitude: current.location.longitude } : undefined;

    const geocoded = await this.geocoding.geocode(address, near);
    if (!geocoded) {
      return { status: "error", message: `No encontré la dirección "${address}".` };
    }

    // Bug real reportado 2026-08-31: sin esto, un barrio/sector ("Buenos
    // Aires") siempre usaba el radio fijo de 300m de
    // `LocationRemindersService` alrededor de un solo punto, dejando fuera
    // partes reales del barrio. Si el usuario no pidió un radio explícito,
    // se usa el que el geocoding sugiere según el tamaño real del área
    // (`suggestedRadiusMeters`, ver `GoogleGeocodingProvider`) — si tampoco
    // hay sugerencia (ej. una dirección puntual), se deja `undefined` y
    // `LocationRemindersService` aplica su default de 300m como antes.
    const effectiveRadiusMeters = radiusMeters ?? geocoded.suggestedRadiusMeters;

    const reminder = await this.reminders.create(ctx.userId, {
      kind: "location",
      message,
      latitude: geocoded.location.latitude,
      longitude: geocoded.location.longitude,
      radiusMeters: effectiveRadiusMeters,
      label: geocoded.formattedAddress,
    });
    // Ver comentario de clase (bug real 2026-09-02) — sin esto, el geofence
    // sigue evaluando la lista vieja de recordatorios pendientes hasta que
    // la caché expire sola (hasta 24h).
    await this.cache.invalidate(ctx.userId);

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
