import { Injectable, Logger } from "@nestjs/common";
import type { AssistantTool, ToolExecutionContext, ToolOutcome } from "./assistant.types";
import { ActivateEmergencyCorridorTool } from "./tools/activate-emergency-corridor.tool";
import { CalculateRouteTool } from "./tools/calculate-route.tool";
import { CreateLocationReminderTool } from "./tools/create-location-reminder.tool";
import { CreateNoteReminderTool } from "./tools/create-note-reminder.tool";
import { GetDrivingModeTool } from "./tools/get-driving-mode.tool";
import { ListChatsTool } from "./tools/list-chats.tool";
import { ListVehiclesTool } from "./tools/list-vehicles.tool";
import { ReadMessagesTool } from "./tools/read-messages.tool";
import { SendMessageTool } from "./tools/send-message.tool";
import { SetDrivingModeTool } from "./tools/set-driving-mode.tool";

export interface ToolDescriptor {
  name: string;
  description: string;
  parameters: AssistantTool["parameters"];
  requiresConfirmation: boolean;
}

/**
 * Punto único de despacho: recibe `(userId, toolName, args, confirmed)` y
 * decide QUÉ tool corre — la "Tool Call → Authorization/Confirmation" del
 * pipeline del proyecto. Cada tool ya trae su propia autorización (ver
 * cada archivo en `tools/`); este servicio no repite esa lógica, solo
 * enruta y captura errores inesperados para que nunca se filtre un stack
 * trace crudo hacia una respuesta que el asistente tendría que "decir en
 * voz alta".
 */
@Injectable()
export class AssistantToolsService {
  private readonly logger = new Logger(AssistantToolsService.name);
  private readonly tools: Map<string, AssistantTool>;

  constructor(
    createLocationReminder: CreateLocationReminderTool,
    createNoteReminder: CreateNoteReminderTool,
    calculateRoute: CalculateRouteTool,
    activateEmergencyCorridor: ActivateEmergencyCorridorTool,
    setDrivingMode: SetDrivingModeTool,
    getDrivingMode: GetDrivingModeTool,
    listVehicles: ListVehiclesTool,
    listChats: ListChatsTool,
    readMessages: ReadMessagesTool,
    sendMessage: SendMessageTool,
  ) {
    const registry: AssistantTool[] = [
      createLocationReminder,
      createNoteReminder,
      calculateRoute,
      activateEmergencyCorridor,
      setDrivingMode,
      getDrivingMode,
      listVehicles,
      listChats,
      readMessages,
      sendMessage,
    ];
    this.tools = new Map(registry.map((tool) => [tool.name, tool]));
  }

  list(): ToolDescriptor[] {
    return [...this.tools.values()].map(({ name, description, parameters, requiresConfirmation }) => ({
      name,
      description,
      parameters,
      requiresConfirmation,
    }));
  }

  async execute(toolName: string, ctx: ToolExecutionContext, args: Record<string, unknown>): Promise<ToolOutcome> {
    const tool = this.tools.get(toolName);
    if (!tool) {
      return { status: "error", message: `No existe la tool "${toolName}".` };
    }

    try {
      return await tool.execute(ctx, args ?? {});
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error desconocido";
      this.logger.error(`execute(${toolName}, ${ctx.userId}): ${message}`);
      return { status: "error", message: "Algo falló ejecutando esa acción. Intenta de nuevo en un momento." };
    }
  }
}
