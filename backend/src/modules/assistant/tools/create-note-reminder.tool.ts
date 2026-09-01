import { Injectable } from "@nestjs/common";
import { LocationRemindersService } from "../../location-reminders/location-reminders.service";
import { NoteReminderSchedulerService } from "../../location-reminders/note-reminder-scheduler.service";
import type { AssistantTool, ToolExecutionContext, ToolOutcome } from "../assistant.types";

function isValidIsoDate(value: string): boolean {
  return !Number.isNaN(new Date(value).getTime());
}

/**
 * Tool de voz pendiente desde `create_location_reminder` (Fase 6): esa tool
 * SOLO crea recordatorios geolocalizados (`kind: "location"`) — para "avísame
 * mañana a las 8am que pague el arriendo" no hay ubicación que geocodificar,
 * es una nota con hora fija (`kind: "note"`, `remindAt`, ADR-0030), ya
 * soportada por `LocationRemindersService`/`NoteReminderSchedulerService` y
 * usada hoy por `POST /location-reminders` — este tool es el mismo flujo,
 * solo expuesto a la voz. Reutiliza exactamente la validación de
 * `LocationRemindersController.create()` (mismo `isValidIsoDate`) y el mismo
 * paso "crear, y si trae remindAt, programar el job de BullMQ" — no se
 * inventa un camino nuevo.
 *
 * `remindAt` lo arma el modelo (Gemini) como ISO 8601 con la zona horaria
 * correcta, a partir de la fecha/hora actual que el modelo ya conoce —
 * mismo criterio que exige `isValidIsoDate` en el controller real. Si el
 * usuario no dio hora ("recuérdame comprar pan", sin "cuándo"), se crea sin
 * `remindAt`: queda como nota/tarea normal en la libreta, visible pero sin
 * aviso a hora fija — no se inventa una hora.
 */
@Injectable()
export class CreateNoteReminderTool implements AssistantTool {
  name = "create_note_reminder";
  description =
    "Crea una nota o tarea en la libreta personal, con aviso opcional a una hora fija. Úsalo cuando el usuario pida un recordatorio que NO es de un lugar (ej. 'recuérdame mañana a las 8am pagar el arriendo'). Para recordatorios de un lugar/dirección usa create_location_reminder.";
  requiresConfirmation = false;
  parameters = {
    type: "object" as const,
    properties: {
      message: { type: "string", description: "Qué debe recordarle el asistente, ej. 'pagar el arriendo'." },
      title: { type: "string", description: "Título corto opcional de la nota." },
      remindAt: {
        type: "string",
        description:
          "Fecha y hora del aviso en formato ISO 8601 con zona horaria, ej. '2026-09-02T08:00:00-05:00'. Solo si el usuario dio una hora/fecha concreta — si no, omitir este campo.",
      },
      isTask: { type: "boolean", description: "true si es una tarea pendiente por hacer (checklist), no solo una nota." },
    },
    required: ["message"],
  };

  constructor(
    private readonly reminders: LocationRemindersService,
    private readonly noteScheduler: NoteReminderSchedulerService,
  ) {}

  async execute(ctx: ToolExecutionContext, args: Record<string, unknown>): Promise<ToolOutcome> {
    const message = typeof args.message === "string" ? args.message.trim() : "";
    const title = typeof args.title === "string" ? args.title.trim() : "";
    const isTask = typeof args.isTask === "boolean" ? args.isTask : false;
    const remindAtRaw = typeof args.remindAt === "string" ? args.remindAt.trim() : "";

    if (!message) {
      return { status: "error", message: "Necesito saber qué quieres que te recuerde." };
    }
    if (remindAtRaw && !isValidIsoDate(remindAtRaw)) {
      return { status: "error", message: "No entendí bien la fecha/hora del recordatorio — ¿puedes repetirla?" };
    }

    const created = await this.reminders.create(ctx.userId, {
      kind: "note",
      message,
      title: title || null,
      isTask,
      remindAt: remindAtRaw || null,
    });

    if (created.remindAt) {
      await this.noteScheduler.schedule(ctx.userId, created.id, created.remindAt);
    }

    return {
      status: "ok",
      data: { id: created.id, message: created.message, remindAt: created.remindAt, isTask: created.isTask },
    };
  }
}
