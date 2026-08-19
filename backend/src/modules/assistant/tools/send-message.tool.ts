import { Injectable } from "@nestjs/common";
import { MessagingService } from "../../messaging/messaging.service";
import type { AssistantTool, ToolExecutionContext, ToolOutcome } from "../assistant.types";

/**
 * `requiresConfirmation = true` a propósito: mandar un mensaje real a otra
 * persona es una acción irreversible y visible para un tercero — mismo
 * criterio ya usado en `activate_emergency_corridor`. Alcance hoy: solo
 * texto (ver MessagingService) — no existe todavía una forma real de mandar
 * una nota de voz, así que esta tool no finge que se envió.
 */
@Injectable()
export class SendMessageTool implements AssistantTool {
  name = "send_message";
  description = "Envía un mensaje de texto real a un contacto, identificado por nombre o por chatId.";
  requiresConfirmation = true;
  parameters = {
    type: "object" as const,
    properties: {
      contactName: { type: "string", description: "Nombre del contacto a quien mandar el mensaje." },
      chatId: { type: "string", description: "Id del chat, si ya se conoce (alternativa a contactName)." },
      body: { type: "string", description: "Texto del mensaje a enviar." },
    },
    required: ["body"],
  };

  constructor(private readonly messaging: MessagingService) {}

  async execute(ctx: ToolExecutionContext, args: Record<string, unknown>): Promise<ToolOutcome> {
    const body = typeof args.body === "string" ? args.body.trim() : "";
    if (!body) {
      return { status: "error", message: "Necesito el texto del mensaje." };
    }

    const chatIdArg = typeof args.chatId === "string" ? args.chatId.trim() : "";
    const contactNameArg = typeof args.contactName === "string" ? args.contactName.trim() : "";
    let chatId = chatIdArg;
    let displayName = contactNameArg || "ese contacto";

    if (!chatId) {
      if (!contactNameArg) {
        return { status: "error", message: "Necesito el nombre del contacto o el chatId." };
      }
      const found = await this.messaging.resolveChatByContactName(ctx.userId, contactNameArg);
      if ("error" in found) {
        if (found.error === "ambiguous") {
          return { status: "error", message: `Hay varios contactos que coinciden con "${contactNameArg}": ${found.matches.join(", ")}. ¿Cuál exactamente?` };
        }
        return { status: "error", message: `No encontré un chat con "${contactNameArg}".` };
      }
      chatId = found.chatId;
      displayName = found.contactName;
    }

    if (!ctx.confirmed) {
      return { status: "needs_confirmation", summary: `Vas a enviarle a ${displayName}: "${body}". ¿Confirmas?` };
    }

    const sent = await this.messaging.sendTextMessage(ctx.userId, chatId, body);
    if (sent === null) {
      return { status: "denied", reason: "No perteneces a ese chat." };
    }
    return { status: "ok", data: { chatId, message: sent } };
  }
}
