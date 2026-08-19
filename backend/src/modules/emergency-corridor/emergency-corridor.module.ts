import { Module } from "@nestjs/common";
import { EmergencyModule } from "../emergency/emergency.module";
import { LocationModule } from "../location/location.module";
import { RouteSessionModule } from "../route-session/route-session.module";
import { EmergencyCorridorController } from "./emergency-corridor.controller";
import { EmergencyCorridorService } from "./emergency-corridor.service";

@Module({
  imports: [EmergencyModule, LocationModule, RouteSessionModule],
  controllers: [EmergencyCorridorController],
  providers: [EmergencyCorridorService],
})
export class EmergencyCorridorModule {}
