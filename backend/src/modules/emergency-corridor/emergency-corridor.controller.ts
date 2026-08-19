import { Body, Controller, ForbiddenException, Get, Post, UseGuards, Req } from "@nestjs/common";
import { SupabaseAuthGuard } from "../../common/guards/supabase-auth.guard";
import type { AuthenticatedRequest } from "../../common/guards/supabase-auth.guard";
import { EmergencyVehiclesService } from "../emergency/emergency-vehicles.service";
import { RouteSessionService } from "../route-session/route-session.service";
import { AlertPolicyService } from "./alert-policy.service";
import { EmergencyCorridorService } from "./emergency-corridor.service";
import type { CorridorCloseReason } from "./emergency-corridor.types";

interface CloseCorridorBody {
  reason?: CorridorCloseReason;
}

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
 *
 * Cada llamada a este endpoint evalúa Y despacha alertas (dedup + cooldown,
 * ver `AlertPolicyService`) — el cliente de la ambulancia debe consultarlo
 * periódicamente mientras el traslado está activo (cada 5-10s es razonable)
 * para que las alertas salgan en tiempo real.
 */
@Controller("emergency/corridor")
@UseGuards(SupabaseAuthGuard)
export class EmergencyCorridorController {
  constructor(
    private readonly vehicles: EmergencyVehiclesService,
    private readonly corridor: EmergencyCorridorService,
    private readonly alertPolicy: AlertPolicyService,
    private readonly routeSession: RouteSessionService,
  ) {}

  @Get("candidates")
  async candidates(@Req() request: AuthenticatedRequest) {
    const status = await this.vehicles.getStatusForDriver(request.userId);
    if (!status?.verified || !status.active) {
      throw new ForbiddenException("Solo conductores de ambulancia verificados y activos pueden consultar el corredor.");
    }

    const found = await this.corridor.findCandidates(request.userId);
    if (found === null) {
      return { hasActiveRoute: false, candidates: [], alerted: [], skippedByCooldown: [] };
    }

    const dispatch = await this.alertPolicy.evaluateAndDispatch(request.userId, found);
    return { hasActiveRoute: true, candidates: found, ...dispatch };
  }

  /**
   * Cierra el corredor de la ambulancia: avisa "ya pasó" (`corridor:closed`)
   * a todo el que fue alertado durante el traslado y libera la ruta activa
   * (misma `RouteSessionService` que `DELETE /navigation/route-session`,
   * reusada aquí para no duplicar el estado de "cuál es mi ruta ahora").
   * `reason` por defecto `cancelled` si no se manda — más seguro asumir que
   * no llegó a completarse que asumir lo contrario sin confirmación.
   */
  @Post("close")
  async close(@Req() request: AuthenticatedRequest, @Body() body: CloseCorridorBody) {
    const status = await this.vehicles.getStatusForDriver(request.userId);
    if (!status?.verified || !status.active) {
      throw new ForbiddenException("Solo conductores de ambulancia verificados y activos pueden cerrar un corredor.");
    }

    const reason: CorridorCloseReason = body?.reason === "completed" ? "completed" : "cancelled";
    const notified = await this.alertPolicy.closeCorridor(request.userId, reason);
    await this.routeSession.clear(request.userId);

    return { closed: true, reason, notified };
  }
}
