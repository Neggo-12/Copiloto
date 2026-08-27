import { Module } from "@nestjs/common";
import { LocationRemindersModule } from "../location-reminders/location-reminders.module";
import { RouteSessionModule } from "../route-session/route-session.module";
import { LocationBroadcastService } from "./location-broadcast.service";
import { LocationGateway } from "./location.gateway";
import { LocationStateService } from "./location-state.service";
import { LocationController } from "./location.controller";
import { NoteReminderProcessor } from "./note-reminder.processor";

/**
 * `NoteReminderProcessor` (ADR-0030) vive aquí, no en
 * `LocationRemindersModule`: necesita `LocationBroadcastService` (provisto
 * en este módulo) además de `LocationRemindersService` (exportado por
 * `LocationRemindersModule`, ya importado abajo) — ponerlo en el otro
 * módulo hubiera recreado el ciclo que ese módulo evita a propósito. La
 * cola `LOCATION_REMINDERS` que consume está registrada en
 * `LocationRemindersModule` (junto a `NoteReminderSchedulerService`, quien
 * la encola); no hace falta volver a registrarla aquí — `@Processor` la
 * encuentra por nombre en todo el contenedor de Nest, no por import.
 */
@Module({
  imports: [RouteSessionModule, LocationRemindersModule],
  controllers: [LocationController],
  providers: [LocationGateway, LocationStateService, LocationBroadcastService, NoteReminderProcessor],
  exports: [LocationStateService, LocationBroadcastService],
})
export class LocationModule {}
