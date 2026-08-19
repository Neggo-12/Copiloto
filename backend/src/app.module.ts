import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { validateEnv } from "./config/env.validation";
import { SupabaseModule } from "./common/supabase/supabase.module";
import { RedisModule } from "./common/redis/redis.module";
import { QueueModule } from "./common/queue/queue.module";
import { GoogleMapsModule } from "./common/google-maps/google-maps.module";
import { HealthController } from "./modules/health/health.controller";
import { EmergencyModule } from "./modules/emergency/emergency.module";
import { SystemQueueModule } from "./modules/system/system-queue.module";
import { LocationModule } from "./modules/location/location.module";
import { NavigationModule } from "./modules/navigation/navigation.module";
import { EmergencyCorridorModule } from "./modules/emergency-corridor/emergency-corridor.module";
import { VehiclesModule } from "./modules/vehicles/vehicles.module";
import { LocationRemindersModule } from "./modules/location-reminders/location-reminders.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    SupabaseModule,
    RedisModule,
    QueueModule,
    GoogleMapsModule,
    EmergencyModule,
    SystemQueueModule,
    LocationModule,
    NavigationModule,
    EmergencyCorridorModule,
    VehiclesModule,
    LocationRemindersModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
