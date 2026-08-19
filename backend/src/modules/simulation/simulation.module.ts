import { Module } from "@nestjs/common";
import { EmergencyCorridorModule } from "../emergency-corridor/emergency-corridor.module";
import { LocationModule } from "../location/location.module";
import { RouteSessionModule } from "../route-session/route-session.module";
import { SimulationController } from "./simulation.controller";
import { SimulationEngineService } from "./simulation.engine";

@Module({
  imports: [LocationModule, RouteSessionModule, EmergencyCorridorModule],
  controllers: [SimulationController],
  providers: [SimulationEngineService],
})
export class SimulationModule {}
