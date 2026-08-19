import { Module } from "@nestjs/common";
import { GeofenceTriggerService } from "./geofence-trigger.service";
import { LocationRemindersController } from "./location-reminders.controller";
import { LocationRemindersService } from "./location-reminders.service";
import { ReminderCacheService } from "./reminder-cache.service";

/**
 * No importa `LocationModule` a propósito: `GeofenceTriggerService` no
 * necesita `LocationBroadcastService` (ver comentario en
 * `geofence-trigger.service.ts`), así que no hay nada que pedirle a ese
 * módulo. Es `LocationModule` el que importa a este (para que
 * `LocationGateway` pueda usar `GeofenceTriggerService`) — una sola
 * dirección, sin ciclo.
 */
@Module({
  controllers: [LocationRemindersController],
  providers: [LocationRemindersService, ReminderCacheService, GeofenceTriggerService],
  exports: [GeofenceTriggerService, LocationRemindersService],
})
export class LocationRemindersModule {}
