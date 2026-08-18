import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import { SupabaseAuthGuard, type AuthenticatedRequest } from "../../common/guards/supabase-auth.guard";
import { EmergencyVehiclesService, type EmergencyVehicleStatus } from "./emergency-vehicles.service";

@Controller("emergency")
@UseGuards(SupabaseAuthGuard)
export class EmergencyController {
  constructor(private readonly vehicles: EmergencyVehiclesService) {}

  /**
   * Estado de verificación de ambulancia del usuario autenticado. `null`
   * significa que nunca se registró como conductor de ambulancia — no es un
   * error, es el caso normal para la enorme mayoría de usuarios.
   */
  @Get("vehicles/me")
  async myVehicleStatus(@Req() request: AuthenticatedRequest): Promise<EmergencyVehicleStatus | null> {
    return this.vehicles.getStatusForDriver(request.userId);
  }
}
