import { Module } from "@nestjs/common";
import { RouteSessionModule } from "../route-session/route-session.module";
import { LocationGateway } from "./location.gateway";
import { LocationStateService } from "./location-state.service";
import { LocationController } from "./location.controller";

@Module({
  imports: [RouteSessionModule],
  controllers: [LocationController],
  providers: [LocationGateway, LocationStateService],
  exports: [LocationStateService],
})
export class LocationModule {}
