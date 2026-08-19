import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { SupabaseAuthGuard, type AuthenticatedRequest } from "../../common/guards/supabase-auth.guard";
import { DrivingModeService } from "./driving-mode.service";
import { VehiclesService } from "./vehicles.service";
import type { VehicleType } from "./vehicles.types";

interface UpsertVehicleBody {
  plate: string;
  nickname?: string;
}

interface SetDrivingModeBody {
  vehicleType: string;
}

function assertVehicleType(value: string): asserts value is VehicleType {
  if (value !== "car" && value !== "motorcycle") {
    throw new BadRequestException("vehicleType debe ser 'car' o 'motorcycle'.");
  }
}

/**
 * Registro de vehículos (autoservicio) + modo de manejo actual. Dos
 * conceptos deliberadamente separados: `user_vehicles` es identidad
 * persistente (qué placas tiene el usuario, Postgres); el modo de manejo es
 * cuál de esos vehículos está usando AHORA (Redis, ver
 * `DrivingModeService`) — un usuario puede tener carro y moto registrados y
 * cambiar de modo varias veces por semana sin volver a registrar nada.
 *
 * Rutas literales (`driving-mode`) van ANTES de las rutas con parámetro
 * (`:vehicleType`) a propósito — Nest resuelve rutas en orden de
 * declaración, y si `:vehicleType` fuera primero capturaría también
 * `/vehicles/driving-mode`.
 */
@Controller("vehicles")
@UseGuards(SupabaseAuthGuard)
export class VehiclesController {
  constructor(
    private readonly vehicles: VehiclesService,
    private readonly drivingMode: DrivingModeService,
  ) {}

  @Get()
  list(@Req() request: AuthenticatedRequest) {
    return this.vehicles.list(request.userId);
  }

  @Get("driving-mode")
  async getDrivingMode(@Req() request: AuthenticatedRequest) {
    const vehicleType = await this.drivingMode.get(request.userId);
    return { vehicleType };
  }

  /**
   * El modo de manejo solo puede apuntar a un vehículo que el usuario ya
   * registró — evita que el estado caliente (Redis) diverja del dato real
   * (Postgres). Si no tiene ese vehículo registrado, 403 con mensaje claro
   * en vez de aceptar un modo fantasma.
   */
  @Post("driving-mode")
  async setDrivingMode(@Req() request: AuthenticatedRequest, @Body() body: SetDrivingModeBody) {
    if (!body?.vehicleType) {
      throw new BadRequestException("vehicleType es requerido.");
    }
    assertVehicleType(body.vehicleType);

    const registered = await this.vehicles.list(request.userId);
    const hasVehicle = registered.some((v) => v.vehicleType === body.vehicleType);
    if (!hasVehicle) {
      throw new ForbiddenException(`No tienes ${body.vehicleType === "car" ? "un carro" : "una moto"} registrado.`);
    }

    await this.drivingMode.set(request.userId, body.vehicleType);
    return { vehicleType: body.vehicleType };
  }

  @Delete("driving-mode")
  async clearDrivingMode(@Req() request: AuthenticatedRequest) {
    await this.drivingMode.clear(request.userId);
    return { cleared: true };
  }

  @Post(":vehicleType")
  async upsert(@Req() request: AuthenticatedRequest, @Param("vehicleType") vehicleType: string, @Body() body: UpsertVehicleBody) {
    assertVehicleType(vehicleType);
    if (!body?.plate) {
      throw new BadRequestException("plate es requerido.");
    }
    return this.vehicles.upsert(request.userId, vehicleType, body.plate, body.nickname ?? null);
  }

  @Delete(":vehicleType")
  async remove(@Req() request: AuthenticatedRequest, @Param("vehicleType") vehicleType: string) {
    assertVehicleType(vehicleType);
    await this.vehicles.remove(request.userId, vehicleType);
    return { removed: true };
  }
}
