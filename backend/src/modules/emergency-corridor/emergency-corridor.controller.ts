import { BadRequestException, Body, Controller, ForbiddenException, Get, Post, UseGuards, Req } from "@nestjs/common";
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
 * Motivos que un CLIENTE real puede mandar al cerrar su propio corredor —
 * deliberadamente sin `"expired"`: ese motivo es interno, solo lo produce
 * `AlertPolicyService.sweepExpired()` (el barrido periódico, ver
 * ADR-0020), nunca una acción humana ("Finalizar"/"Cancelar" son las
 * únicas dos que existen en la UI real). Dejar que un cliente lo mande
 * dejaría etiquetar mal un cierre real como si hubiera sido el barrido.
 */
const CLIENT_CLOSE_REASONS = ["completed", "cancelled"] as const;

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
   * no llegó a completarse que asumir lo contrario sin confirmación. Si SÍ
   * se manda pero no es uno de los dos motivos reales de cliente
   * (`CLIENT_CLOSE_REASONS`), se rechaza con 400 en vez de asumir
   * `cancelled` en silencio — encontrado auditando este endpoint para el
   * Escenario 10 (ADR-0022): antes, cualquier valor no reconocido (un typo
   * real del cliente, ej. "finished" en vez de "completed") caía callado a
   * `cancelled`, notificando a los candidatos con la etiqueta equivocada
   * ("se canceló" en vez de "ya pasó") sin que nadie se enterara del error
   * real del cliente.
   */
  @Post("close")
  async close(@Req() request: AuthenticatedRequest, @Body() body: CloseCorridorBody) {
    const status = await this.vehicles.getStatusForDriver(request.userId);
    if (!status?.verified || !status.active) {
      throw new ForbiddenException("Solo conductores de ambulancia verificados y activos pueden cerrar un corredor.");
    }

    const rawReason = body?.reason;
    if (rawReason !== undefined && !(CLIENT_CLOSE_REASONS as readonly string[]).includes(rawReason)) {
      throw new BadRequestException(`reason inválido: "${rawReason}". Válidos: ${CLIENT_CLOSE_REASONS.join(", ")}.`);
    }
    const reason: CorridorCloseReason = rawReason === "completed" ? "completed" : "cancelled";
    const notified = await this.alertPolicy.closeCorridor(request.userId, reason);
    await this.routeSession.clear(request.userId);

    return { closed: true, reason, notified };
  }
}
