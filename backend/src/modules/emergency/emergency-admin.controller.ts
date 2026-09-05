import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { AdminGuard } from "../../common/guards/admin.guard";
import { SupabaseAuthGuard, type AuthenticatedRequest } from "../../common/guards/supabase-auth.guard";
import { EmergencyIncidentsService, type IncidentStatus } from "./emergency-incidents.service";
import { EmergencyVehiclesService } from "./emergency-vehicles.service";

interface AssignAmbulanceBody {
  phone: string;
  phoneCountryCode: string;
  plate: string;
  organization?: string;
}

interface SetActiveBody {
  active: boolean;
}

interface SetIncidentStatusBody {
  status?: IncidentStatus;
}

/** Estados a los que el administrador puede mover un incidente a mano — "creado" queda afuera a propósito (ver `EmergencyIncidentsService.setStatus`). */
const ADMIN_SETTABLE_INCIDENT_STATUSES = ["recibido", "en_atencion", "cancelado", "cerrado"] as const;

/**
 * Panel de administrador real (2026-09-01, a pedido explícito del
 * fundador): antes de esto, "verificar una ambulancia" solo se podía hacer
 * por SQL/MCP directo (ver ADR-0006, "Consecuencias") — cero cambio a la
 * autorización real (sigue siendo `service_role`/admin quien escribe, RLS
 * sin autoservicio intacta), esto solo agrega un camino real desde la app
 * para el administrador en vez de pedirlo por chat cada vez.
 *
 * `AdminGuard` corre DESPUÉS de `SupabaseAuthGuard` a propósito — necesita
 * `request.userId` ya puesto por un JWT real verificado.
 */
@Controller("emergency/admin")
@UseGuards(SupabaseAuthGuard, AdminGuard)
export class EmergencyAdminController {
  constructor(
    private readonly vehicles: EmergencyVehiclesService,
    private readonly incidents: EmergencyIncidentsService,
  ) {}

  @Get("vehicles")
  async list() {
    return this.vehicles.listAll();
  }

  /**
   * Incidentes reales de "Copiloto, llama a la policía" (ver
   * `CallPoliceTool`/`EmergencyIncidentsService`, docs/decisions/README.md
   * decisión (33)) — cada fila ya trae los datos reales de la persona
   * (nombre/teléfono/correo, ubicación) tomados al momento de crear el
   * incidente, sin necesitar unir contra `profiles` desde acá.
   */
  @Get("incidents")
  async listIncidents() {
    return this.incidents.listAll();
  }

  /**
   * Verifica/asigna una ambulancia por TELÉFONO del conductor (no por
   * `driver_id` crudo — el administrador conoce el teléfono real de la
   * persona, no su UUID interno). 404 si nadie con ese teléfono está
   * registrado en la plataforma todavía.
   */
  @Post("vehicles")
  async assign(@Req() request: AuthenticatedRequest, @Body() body: AssignAmbulanceBody) {
    const result = await this.vehicles.assignVerified(request.userId, {
      phone: body.phone,
      phoneCountryCode: body.phoneCountryCode,
      plate: body.plate,
      organization: body.organization,
    });
    if ("error" in result) {
      return { assigned: false, error: "driver_not_found" as const };
    }
    return { assigned: true as const, vehicle: result };
  }

  /** Desactiva/reactiva sin borrar historial — nunca revoca `verified` (eso es una acción explícita distinta, hoy sin endpoint propio por falta de un caso de uso real todavía). */
  @Patch("vehicles/:driverId")
  async setActive(@Param("driverId") driverId: string, @Body() body: SetActiveBody) {
    await this.vehicles.setActive(driverId, body.active === true);
    return { updated: true };
  }

  /**
   * Avanza el estado de un incidente real ("recibido"/"en atención"/
   * "cancelado"/"cerrado") — antes la tabla de incidentes era de solo
   * lectura, sin ninguna acción real posible desde el panel. 400 si mandan
   * un valor fuera de `ADMIN_SETTABLE_INCIDENT_STATUSES` (mismo criterio que
   * `close()` en `EmergencyCorridorController`: rechazar un valor no
   * reconocido en vez de asumir algo en silencio).
   */
  @Patch("incidents/:id")
  async setIncidentStatus(@Param("id") id: string, @Body() body: SetIncidentStatusBody) {
    const status = body?.status;
    if (!status || !(ADMIN_SETTABLE_INCIDENT_STATUSES as readonly string[]).includes(status)) {
      throw new BadRequestException(
        `status inválido: "${String(status)}". Válidos: ${ADMIN_SETTABLE_INCIDENT_STATUSES.join(", ")}.`,
      );
    }
    const incident = await this.incidents.setStatus(id, status as Exclude<IncidentStatus, "creado">);
    return { updated: true as const, incident };
  }
}
