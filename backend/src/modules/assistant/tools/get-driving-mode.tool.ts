import { Injectable } from "@nestjs/common";
import { DrivingModeService } from "../../vehicles/driving-mode.service";
import type { AssistantTool, ToolExecutionContext, ToolOutcome } from "../assistant.types";

/**
 * Consulta de solo lectura — la usa el asistente para decidir si necesita
 * preguntar "¿vas en el carro o en la moto?" antes de calcular una ruta o
 * activar el corredor, en vez de preguntar siempre.
 */
@Injectable()
export class GetDrivingModeTool implements AssistantTool {
  name = "get_driving_mode";
  description = "Consulta qué vehículo está usando el usuario ahora mismo (carro, moto, o ninguno fijado).";
  requiresConfirmation = false;
  parameters = { type: "object" as const, properties: {}, required: [] };

  constructor(private readonly drivingMode: DrivingModeService) {}

  async execute(ctx: ToolExecutionContext): Promise<ToolOutcome> {
    const vehicleType = await this.drivingMode.get(ctx.userId);
    return { status: "ok", data: { vehicleType } };
  }
}
