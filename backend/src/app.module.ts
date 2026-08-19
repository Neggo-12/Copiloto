import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { validateEnv } from "./config/env.validation";
import { SupabaseModule } from "./common/supabase/supabase.module";
import { RedisModule } from "./common/redis/redis.module";
import { QueueModule } from "./common/queue/queue.module";
import { HealthController } from "./modules/health/health.controller";
import { EmergencyModule } from "./modules/emergency/emergency.module";
import { SystemQueueModule } from "./modules/system/system-queue.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    SupabaseModule,
    RedisModule,
    QueueModule,
    EmergencyModule,
    SystemQueueModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
