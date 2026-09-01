import { Module } from "@nestjs/common";
import { EmergencyAdminController } from "./emergency-admin.controller";
import { EmergencyController } from "./emergency.controller";
import { EmergencyVehiclesService } from "./emergency-vehicles.service";

@Module({
  controllers: [EmergencyController, EmergencyAdminController],
  providers: [EmergencyVehiclesService],
  exports: [EmergencyVehiclesService],
})
export class EmergencyModule {}
