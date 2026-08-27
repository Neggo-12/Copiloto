import { InjectQueue } from "@nestjs/bullmq";
import { Injectable, Logger } from "@nestjs/common";
import type { Queue } from "bullmq";
import {
  LOCATION_REMINDER_JOB_NAMES,
  QUEUE_NAMES,
  type NoteReminderJobData,
  type NoteReminderJobResult,
} from "../../common/queue/queue-names";

/**
 * Encola/cancela el job de BullMQ que dispara un recordatorio de nota a
 * hora fija (ADR-0030). Vive en `LocationRemindersModule` (no en
 * `LocationModule`) a propósito: solo necesita la `Queue`, nunca
 * `LocationBroadcastService` — así el `controller` de este mismo módulo
 * puede usarlo directo al crear/editar una nota, sin recrear el ciclo que
 * `GeofenceTriggerService` ya evita (ver comentario en
 * `location-reminders.module.ts`). El procesador que sí necesita
 * `LocationBroadcastService` (`NoteReminderProcessor`) vive en
 * `LocationModule` — BullMQ los conecta por nombre de cola, no hace falta
 * que compartan módulo (`BullExplorer` busca la `Queue` en todo el
 * contenedor, no solo en el módulo del processor).
 *
 * `jobId = reminderId`: reprogramar/cancelar es simplemente quitar el job
 * existente (si lo hay) y, si aplica, agregar uno nuevo — nunca hay dos
 * jobs vivos para el mismo recordatorio.
 */
@Injectable()
export class NoteReminderSchedulerService {
  private readonly logger = new Logger(NoteReminderSchedulerService.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.LOCATION_REMINDERS)
    private readonly queue: Queue<NoteReminderJobData, NoteReminderJobResult, string>,
  ) {}

  /** Programa (o reprograma) el aviso de una nota para `remindAt` (ISO). Si ya está en el pasado, se dispara casi inmediatamente (delay 0). */
  async schedule(userId: string, reminderId: string, remindAt: string): Promise<void> {
    await this.removeExisting(reminderId);

    const delay = Math.max(0, new Date(remindAt).getTime() - Date.now());
    await this.queue.add(
      LOCATION_REMINDER_JOB_NAMES.NOTE_DUE,
      { userId, reminderId },
      { jobId: reminderId, delay },
    );
  }

  /** Quita el job pendiente de una nota (al cancelar su hora fija, completarla, archivarla o borrarla). */
  async cancel(reminderId: string): Promise<void> {
    await this.removeExisting(reminderId);
  }

  private async removeExisting(reminderId: string): Promise<void> {
    try {
      const existing = await this.queue.getJob(reminderId);
      if (existing) {
        await existing.remove();
      }
    } catch (error) {
      // Puede fallar si el job ya está `active`/ya no existe (BullMQ no
      // permite remover uno en ejecución) — no es un error real del
      // dominio, solo se registra; se prioriza no tumbar la petición del
      // usuario por esto. `markNoteReminderTriggered` (`WHERE
      // status='pending'`) es la defensa real contra un job viejo que
      // alcanzó a dispararse de todos modos.
      this.logger.warn(`No se pudo remover el job previo del recordatorio ${reminderId}: ${String(error)}`);
    }
  }
}
