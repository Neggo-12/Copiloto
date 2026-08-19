import { Injectable } from "@nestjs/common";
import { VehiclesService } from "../../vehicles/vehicles.service";
import type { AssistantTool, ToolExecutionContext, ToolOutcome } from "../assistant.types";

@Injectable()
export class ListVehiclesTool implements AssistantTool {
  name = "list_vehicles";
  description = "Lista los vehículos (carro/moto) que el usuario tiene registrados.";
  requiresConfirmation = false;
  parameters = { type: "object" as const, properties: {}, required: [] };

  constructor(private readonly vehicles: VehiclesService) {}

  async execute(ctx: ToolExecutionContext): Promise<ToolOutcome> {
    const vehicles = await this.vehicles.list(ctx.userId);
    return { status: "ok", data: { vehicles } };
  }
}
