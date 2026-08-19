import { Module } from "@nestjs/common";
import { LocationGateway } from "./location.gateway";
import { LocationStateService } from "./location-state.service";
import { LocationController } from "./location.controller";

@Module({
  controllers: [LocationController],
  providers: [LocationGateway, LocationStateService],
  exports: [LocationStateService],
})
export class LocationModule {}
