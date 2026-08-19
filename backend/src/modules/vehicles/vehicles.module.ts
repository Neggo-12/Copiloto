import { Module } from "@nestjs/common";
import { DrivingModeService } from "./driving-mode.service";
import { VehiclesController } from "./vehicles.controller";
import { VehiclesService } from "./vehicles.service";

@Module({
  controllers: [VehiclesController],
  providers: [VehiclesService, DrivingModeService],
  exports: [VehiclesService, DrivingModeService],
})
export class VehiclesModule {}
