import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { EnvConfig } from "../../config/env.validation";

export const GOOGLE_MAPS_API_KEY = Symbol("GOOGLE_MAPS_API_KEY");

/**
 * Único lugar que conoce la API key de Google Maps Platform. Los adapters
 * (`RoutingProvider`, `GeocodingProvider`, `PlacesProvider`) la reciben
 * inyectada — nunca leen `process.env` directamente — mismo principio que
 * `SupabaseModule`/`RedisModule`: cambiar de proveedor (o rotar la key) es
 * cambiar esta variable de entorno, no tocar lógica de negocio.
 *
 * `GOOGLE_MAPS_API_KEY` es opcional en el arranque (a diferencia de
 * `REDIS_URL`) porque el fundador todavía no la ha provisionado — mismo
 * patrón que tuvo `REDIS_URL` antes de que Upstash quedara decidido. Cuando
 * la key esté configurada en producción, se sube a variable requerida.
 */
@Global()
@Module({
  providers: [
    {
      provide: GOOGLE_MAPS_API_KEY,
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvConfig, true>): string | undefined => {
        return config.get("GOOGLE_MAPS_API_KEY", { infer: true });
      },
    },
  ],
  exports: [GOOGLE_MAPS_API_KEY],
})
export class GoogleMapsModule {}
