import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { SupabaseAuthGuard, type AuthenticatedRequest } from "../../common/guards/supabase-auth.guard";
import { LocationRemindersService } from "./location-reminders.service";
import { ReminderCacheService } from "./reminder-cache.service";

interface CreateReminderBody {
  message: string;
  latitude: number;
  longitude: number;
  radiusMeters?: number;
  label?: string;
}

/**
 * Recordatorios por ubicación (Fase 7). Recibe coordenadas YA resueltas,
 * no una dirección de texto — resolver "Belén, Medellín" a coordenadas es
 * responsabilidad del llamador vía el endpoint que ya existe,
 * `GET /navigation/geocode` (ADR-0010). No se duplica geocoding aquí, y se
 * evita acoplar este módulo a Google Maps sin necesidad. El futuro tool de
 * voz `create_location_reminder` (Fase 6) hará esto en dos llamadas:
 * geocodificar, después crear el recordatorio con las coordenadas.
 */
@Controller("location-reminders")
@UseGuards(SupabaseAuthGuard)
export class LocationRemindersController {
  constructor(
    private readonly reminders: LocationRemindersService,
    private readonly cache: ReminderCacheService,
  ) {}

  @Get()
  list(@Req() request: AuthenticatedRequest) {
    return this.reminders.list(request.userId);
  }

  @Post()
  async create(@Req() request: AuthenticatedRequest, @Body() body: CreateReminderBody) {
    if (!body?.message?.trim()) {
      throw new BadRequestException("message es requerido.");
    }
    if (typeof body.latitude !== "number" || typeof body.longitude !== "number") {
      throw new BadRequestException("latitude y longitude son requeridos y deben ser numéricos.");
    }
    if (body.latitude < -90 || body.latitude > 90 || body.longitude < -180 || body.longitude > 180) {
      throw new BadRequestException("latitude/longitude fuera de rango.");
    }
    if (body.radiusMeters !== undefined && (typeof body.radiusMeters !== "number" || body.radiusMeters <= 0)) {
      throw new BadRequestException("radiusMeters debe ser un número positivo.");
    }

    const created = await this.reminders.create(
      request.userId,
      body.message.trim(),
      body.latitude,
      body.longitude,
      body.radiusMeters,
      body.label ?? null,
    );
    await this.cache.invalidate(request.userId);
    return created;
  }

  @Delete(":id")
  async cancel(@Req() request: AuthenticatedRequest, @Param("id") id: string) {
    await this.reminders.cancel(request.userId, id);
    await this.cache.invalidate(request.userId);
    return { cancelled: true };
  }
}
