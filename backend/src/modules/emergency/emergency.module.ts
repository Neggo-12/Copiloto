import { Module } from "@nestjs/common";
import { EmergencyAdminController } from "./emergency-admin.controller";
import { EmergencyController } from "./emergency.controller";
import { EmergencyIncidentsService } from "./emergency-incidents.service";
import { EmergencyVehiclesService } from "./emergency-vehicles.service";

@Module({
  controllers: [EmergencyController, EmergencyAdminController],
  providers: [EmergencyVehiclesService, EmergencyIncidentsService],
  exports: [EmergencyVehiclesService, EmergencyIncidentsService],
})
export class EmergencyModule {}
