import { Controller, ForbiddenException, Get, UseGuards, Req } from "@nestjs/common";
import { SupabaseAuthGuard } from "../../common/guards/supabase-auth.guard";
import type { AuthenticatedRequest } from "../../common/guards/supabase-auth.guard";
import { EmergencyVehiclesService } from "../emergency/emergency-vehicles.service";
import { EmergencyCorridorService } from "./emergency-corridor.service";

/**
 * Solo ambulancias verificadas Y activas pueden consultar candidatos — "qué
 * usuarios están cerca de mí" es información sensible de terceros, nunca se
 * expone a cualquier usuario autenticado (regla de seguridad: compartir
 * ubicación de terceros sin autorización explícita, nunca).
 *
 * Arrancar el corredor NO tiene un endpoint propio: un conductor de
 * ambulancia arranca su ruta con el mismo `POST /navigation/route-session`
 * que cualquier usuario (ADR-0011) — el corredor de emergencia ES esa ruta
 * activa. Duplicar ese endpoint aquí solo para ambulancias habría sido
 * reconstruir algo que ya existe.
 */
@Controller("emergency/corridor")
@UseGuards(SupabaseAuthGuard)
export class EmergencyCorridorController {
  constructor(
    private readonly vehicles: EmergencyVehiclesService,
    private readonly corridor: EmergencyCorridorService,
  ) {}

  @Get("candidates")
  async candidates(@Req() request: AuthenticatedRequest) {
    const status = await this.vehicles.getStatusForDriver(request.userId);
    if (!status?.verified || !status.active) {
      throw new ForbiddenException("Solo conductores de ambulancia verificados y activos pueden consultar el corredor.");
    }

    const candidates = await this.corridor.findCandidates(request.userId);
    return { hasActiveRoute: candidates !== null, candidates: candidates ?? [] };
  }
}
