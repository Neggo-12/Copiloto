import { Injectable } from "@nestjs/common";
import { MessagingService } from "../../messaging/messaging.service";
import type { AssistantTool, ToolExecutionContext, ToolOutcome } from "../assistant.types";

@Injectable()
export class ListChatsTool implements AssistantTool {
  name = "list_chats";
  description = "Lista los chats 1 a 1 reales del usuario (con quién puede hablar por mensaje).";
  requiresConfirmation = false;
  parameters = { type: "object" as const, properties: {}, required: [] };

  constructor(private readonly messaging: MessagingService) {}

  async execute(ctx: ToolExecutionContext): Promise<ToolOutcome> {
    const chats = await this.messaging.listChats(ctx.userId);
    return { status: "ok", data: { chats } };
  }
}
