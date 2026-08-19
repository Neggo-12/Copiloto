import { Injectable } from "@nestjs/common";
import { VehiclesService } from "../../vehicles/vehicles.service";
import { DrivingModeService } from "../../vehicles/driving-mode.service";
import type { AssistantTool, ToolExecutionContext, ToolOutcome } from "../assistant.types";

/**
 * Cubre el segundo camino de entrada al Modo de manejo que pidió el
 * fundador: "que la misma app identifique y el asistente le pregunte
 * 'vas en el carro o en la moto'" (ADR-0014). Misma validación que
 * `VehiclesController.setDrivingMode`: no se puede fijar un modo para un
 * vehículo que el usuario no registró.
 */
@Injectable()
export class SetDrivingModeTool implements AssistantTool {
  name = "set_driving_mode";
  description = "Fija el vehículo que el usuario está usando ahora mismo (carro o moto).";
  requiresConfirmation = false;
  parameters = {
    type: "object" as const,
    properties: {
      vehicleType: { type: "string", description: "'car' o 'motorcycle'.", enum: ["car", "motorcycle"] },
    },
    required: ["vehicleType"],
  };

  constructor(
    private readonly vehicles: VehiclesService,
    private readonly drivingMode: DrivingModeService,
  ) {}

  async execute(ctx: ToolExecutionContext, args: Record<string, unknown>): Promise<ToolOutcome> {
    const vehicleType = args.vehicleType;
    if (vehicleType !== "car" && vehicleType !== "motorcycle") {
      return { status: "error", message: "El vehículo debe ser 'car' o 'motorcycle'." };
    }

    const registered = await this.vehicles.list(ctx.userId);
    const hasVehicle = registered.some((v) => v.vehicleType === vehicleType);
    if (!hasVehicle) {
      return { status: "denied", reason: `No tienes ${vehicleType === "car" ? "un carro" : "una moto"} registrado todavía.` };
    }

    await this.drivingMode.set(ctx.userId, vehicleType);
    return { status: "ok", data: { vehicleType } };
  }
}
