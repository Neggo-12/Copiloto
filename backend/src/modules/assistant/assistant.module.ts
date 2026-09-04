import { Module } from "@nestjs/common";
import { EmergencyModule } from "../emergency/emergency.module";
import { LocationModule } from "../location/location.module";
import { LocationRemindersModule } from "../location-reminders/location-reminders.module";
import { MessagingModule } from "../messaging/messaging.module";
import { NavigationModule } from "../navigation/navigation.module";
import { RouteSessionModule } from "../route-session/route-session.module";
import { VehiclesModule } from "../vehicles/vehicles.module";
import { AssistantController } from "./assistant.controller";
import { AssistantToolsService } from "./assistant-tools.service";
import { AssistantVoiceGateway } from "./assistant-voice.gateway";
import { GeminiLiveService } from "./gemini-live.service";
import { ActivateEmergencyCorridorTool } from "./tools/activate-emergency-corridor.tool";
import { CalculateRouteTool } from "./tools/calculate-route.tool";
import { CallPoliceTool } from "./tools/call-police.tool";
import { CreateLocationReminderTool } from "./tools/create-location-reminder.tool";
import { CreateNoteReminderTool } from "./tools/create-note-reminder.tool";
import { GetDrivingModeTool } from "./tools/get-driving-mode.tool";
import { ListChatsTool } from "./tools/list-chats.tool";
import { ListVehiclesTool } from "./tools/list-vehicles.tool";
import { OpenNavigationTool } from "./tools/open-navigation.tool";
import { ReadMessagesTool } from "./tools/read-messages.tool";
import { SendMessageTool } from "./tools/send-message.tool";
import { SetDrivingModeTool } from "./tools/set-driving-mode.tool";

/**
 * Módulo "hoja" a propósito: solo consume servicios/proveedores que ya
 * exportan otros módulos (Navigation, Location, RouteSession, Emergency,
 * Vehicles, LocationReminders, Messaging) — ninguno de ellos importa
 * `AssistantModule` de vuelta, así que no hay riesgo de ciclo (mismo cuidado
 * que ya se tuvo al diseñar `LocationRemindersModule` para evitarlo con
 * `NavigationModule` en ADR-0015).
 */
@Module({
  imports: [NavigationModule, LocationModule, RouteSessionModule, EmergencyModule, VehiclesModule, LocationRemindersModule, MessagingModule],
  controllers: [AssistantController],
  providers: [
    AssistantToolsService,
    GeminiLiveService,
    AssistantVoiceGateway,
    CreateLocationReminderTool,
    CreateNoteReminderTool,
    CalculateRouteTool,
    OpenNavigationTool,
    ActivateEmergencyCorridorTool,
    CallPoliceTool,
    SetDrivingModeTool,
    GetDrivingModeTool,
    ListVehiclesTool,
    ListChatsTool,
    ReadMessagesTool,
    SendMessageTool,
  ],
})
export class AssistantModule {}
