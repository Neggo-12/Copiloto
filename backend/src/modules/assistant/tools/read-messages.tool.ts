import { Injectable } from "@nestjs/common";
import { MessagingService } from "../../messaging/messaging.service";
import type { AssistantTool, ToolExecutionContext, ToolOutcome } from "../assistant.types";

/**
 * Alcance a propósito: SOLO mensajes de texto ya sincronizados de verdad con
 * Supabase (ver MessagingService). Notas de voz, fotos, ubicación, etc.
 * siguen siendo simulación local en el frontend hoy — no hay dato real que
 * leer todavía, así que esta tool no finge poder "leer una nota de voz".
 */
@Injectable()
export class ReadMessagesTool implements AssistantTool {
  name = "read_messages";
  description = "Lee los últimos mensajes de texto de un chat, identificado por nombre de contacto o por chatId.";
  requiresConfirmation = false;
  parameters = {
    type: "object" as const,
    properties: {
      contactName: { type: "string", description: "Nombre del contacto cuyo chat se quiere leer (ej. 'Jheison')." },
      chatId: { type: "string", description: "Id del chat, si ya se conoce (alternativa a contactName)." },
      limit: { type: "string", description: "Cuántos mensajes traer (por defecto 10, máximo 50)." },
    },
    required: [],
  };

  constructor(private readonly messaging: MessagingService) {}

  async execute(ctx: ToolExecutionContext, args: Record<string, unknown>): Promise<ToolOutcome> {
    const resolved = await this.resolveChatId(ctx.userId, args);
    if ("outcome" in resolved) return resolved.outcome;

    const limitRaw = typeof args.limit === "string" ? Number.parseInt(args.limit, 10) : typeof args.limit === "number" ? args.limit : 10;
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 50) : 10;

    const messages = await this.messaging.getRecentTextMessages(ctx.userId, resolved.chatId, limit);
    if (messages === null) {
      return { status: "denied", reason: "No perteneces a ese chat." };
    }
    return { status: "ok", data: { chatId: resolved.chatId, messages } };
  }

  private async resolveChatId(userId: string, args: Record<string, unknown>): Promise<{ chatId: string } | { outcome: ToolOutcome }> {
    const chatIdArg = typeof args.chatId === "string" ? args.chatId.trim() : "";
    if (chatIdArg) return { chatId: chatIdArg };

    const contactName = typeof args.contactName === "string" ? args.contactName.trim() : "";
    if (!contactName) {
      return { outcome: { status: "error", message: "Necesito el nombre del contacto o el chatId." } };
    }
    const found = await this.messaging.resolveChatByContactName(userId, contactName);
    if ("error" in found) {
      if (found.error === "ambiguous") {
        return { outcome: { status: "error", message: `Hay varios contactos que coinciden con "${contactName}": ${found.matches.join(", ")}. ¿Cuál exactamente?` } };
      }
      return { outcome: { status: "error", message: `No encontré un chat con "${contactName}".` } };
    }
    return { chatId: found.chatId };
  }
}
