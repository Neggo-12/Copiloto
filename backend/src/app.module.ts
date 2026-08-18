import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { validateEnv } from "./config/env.validation";
import { SupabaseModule } from "./common/supabase/supabase.module";
import { HealthController } from "./modules/health/health.controller";
import { EmergencyModule } from "./modules/emergency/emergency.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    SupabaseModule,
    EmergencyModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
