import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createClient } from "@supabase/supabase-js";
import type { EnvConfig } from "../../config/env.validation";

export const SUPABASE_ADMIN_CLIENT = Symbol("SUPABASE_ADMIN_CLIENT");

/**
 * Cliente Supabase con la service role key: bypassa RLS a propósito, porque
 * este backend es quien decide autorización explícitamente en cada caso de
 * uso (nunca confiar en el rol enviado por el cliente — regla de seguridad
 * global). La service role key vive solo en variables de entorno del
 * backend, jamás en el front-end ni en git (CLAUDE.md / regla de secretos).
 */
@Global()
@Module({
  providers: [
    {
      provide: SUPABASE_ADMIN_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvConfig, true>) => {
        return createClient(config.get("SUPABASE_URL", { infer: true }), config.get("SUPABASE_SERVICE_ROLE_KEY", { infer: true }), {
          auth: { persistSession: false, autoRefreshToken: false },
        });
      },
    },
  ],
  exports: [SUPABASE_ADMIN_CLIENT],
})
export class SupabaseModule {}
