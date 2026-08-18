import { Module } from "@nestjs/common";
import { EmergencyController } from "./emergency.controller";
import { EmergencyVehiclesService } from "./emergency-vehicles.service";

@Module({
  controllers: [EmergencyController],
  providers: [EmergencyVehiclesService],
  exports: [EmergencyVehiclesService],
})
export class EmergencyModule {}
