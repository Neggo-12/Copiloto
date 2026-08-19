import { Module } from "@nestjs/common";
import { RouteSessionModule } from "../route-session/route-session.module";
import { LocationBroadcastService } from "./location-broadcast.service";
import { LocationGateway } from "./location.gateway";
import { LocationStateService } from "./location-state.service";
import { LocationController } from "./location.controller";

@Module({
  imports: [RouteSessionModule],
  controllers: [LocationController],
  providers: [LocationGateway, LocationStateService, LocationBroadcastService],
  exports: [LocationStateService, LocationBroadcastService],
})
export class LocationModule {}
