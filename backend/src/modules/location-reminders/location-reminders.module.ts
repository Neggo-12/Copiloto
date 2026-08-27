import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { QUEUE_NAMES } from "../../common/queue/queue-names";
import { GeofenceTriggerService } from "./geofence-trigger.service";
import { LocationRemindersController } from "./location-reminders.controller";
import { LocationRemindersService } from "./location-reminders.service";
import { NoteReminderSchedulerService } from "./note-reminder-scheduler.service";
import { ReminderCacheService } from "./reminder-cache.service";

/**
 * No importa `LocationModule` a propósito: `GeofenceTriggerService` no
 * necesita `LocationBroadcastService` (ver comentario en
 * `geofence-trigger.service.ts`), así que no hay nada que pedirle a ese
 * módulo. Es `LocationModule` el que importa a este (para que
 * `LocationGateway` pueda usar `GeofenceTriggerService`) — una sola
 * dirección, sin ciclo.
 *
 * Registra aquí la cola `LOCATION_REMINDERS` (ADR-0030) porque
 * `NoteReminderSchedulerService` — el único que necesita encolar/cancelar
 * jobs — vive en este módulo, junto al controller que lo usa al
 * crear/editar una nota. El processor que consume esos jobs
 * (`NoteReminderProcessor`) vive en `LocationModule` porque necesita
 * `LocationBroadcastService`; no hace falta que ambos estén en el mismo
 * módulo — BullMQ los conecta por nombre de cola, no por import de Nest.
 */
@Module({
  imports: [BullModule.registerQueue({ name: QUEUE_NAMES.LOCATION_REMINDERS })],
  controllers: [LocationRemindersController],
  providers: [LocationRemindersService, ReminderCacheService, GeofenceTriggerService, NoteReminderSchedulerService],
  exports: [GeofenceTriggerService, LocationRemindersService, NoteReminderSchedulerService],
})
export class LocationRemindersModule {}
