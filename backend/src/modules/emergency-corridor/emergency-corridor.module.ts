import { Module } from "@nestjs/common";
import { EmergencyModule } from "../emergency/emergency.module";
import { LocationModule } from "../location/location.module";
import { RouteSessionModule } from "../route-session/route-session.module";
import { VehiclesModule } from "../vehicles/vehicles.module";
import { AlertPolicyService } from "./alert-policy.service";
import { EmergencyCorridorController } from "./emergency-corridor.controller";
import { EmergencyCorridorService } from "./emergency-corridor.service";

@Module({
  imports: [EmergencyModule, LocationModule, RouteSessionModule, VehiclesModule],
  controllers: [EmergencyCorridorController],
  providers: [EmergencyCorridorService, AlertPolicyService],
})
export class EmergencyCorridorModule {}
