import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import type { Job } from "bullmq";
import {
  LOCATION_REMINDER_JOB_NAMES,
  QUEUE_NAMES,
  type NoteReminderJobData,
  type NoteReminderJobResult,
} from "../../common/queue/queue-names";
import { LocationRemindersService } from "../location-reminders/location-reminders.service";
import { LocationBroadcastService } from "./location-broadcast.service";

/**
 * Dispara el aviso de una nota con hora fija (ADR-0030) cuando BullMQ
 * entrega su job (`NoteReminderSchedulerService`, en
 * `LocationRemindersModule`, lo encoló con `delay = remindAt - ahora`).
 *
 * Vive en `LocationModule` (no en `LocationRemindersModule`) porque
 * necesita `LocationBroadcastService` — a diferencia del geofence
 * (`GeofenceTriggerService`), que entrega el resultado en el ack del mismo
 * socket que reportó la ubicación, aquí NO hay una petición del cliente en
 * curso en el momento en que el job dispara: es un evento puramente
 * server-initiated, exactamente el caso para el que se construyó
 * `LocationBroadcastService.notify()`. Limitación honesta: solo llega si
 * el usuario tiene un socket conectado al namespace `/location` en ese
 * momento — no hay proveedor FCM/APNs todavía (gap documentado, ver
 * MISSING_CAPABILITIES.md), así que sin socket activo el aviso se pierde
 * en silencio (la nota queda `triggered` en la base, visible al abrir la
 * app, pero no llega push).
 */
@Processor(QUEUE_NAMES.LOCATION_REMINDERS)
export class NoteReminderProcessor extends WorkerHost {
  private readonly logger = new Logger(NoteReminderProcessor.name);

  constructor(
    private readonly reminders: LocationRemindersService,
    private readonly broadcast: LocationBroadcastService,
  ) {
    super();
  }

  async process(job: Job<NoteReminderJobData, NoteReminderJobResult, string>): Promise<NoteReminderJobResult> {
    if (job.name !== LOCATION_REMINDER_JOB_NAMES.NOTE_DUE) {
      throw new Error(`Job desconocido en la cola '${QUEUE_NAMES.LOCATION_REMINDERS}': ${job.name}`);
    }

    const { userId, reminderId } = job.data;
    // Idempotente: si la nota ya no está `pending` (el usuario la canceló,
    // completó o borró entre que se encoló el job y que disparó), no
    // devuelve fila y aquí no se notifica nada.
    const reminder = await this.reminders.markNoteReminderTriggered(userId, reminderId);
    if (!reminder) {
      this.logger.log(`Recordatorio ${reminderId} ya no estaba pendiente al disparar — sin notificación`);
      return { delivered: false };
    }

    this.broadcast.notify(userId, "reminder:due", reminder);
    return { delivered: true };
  }
}
