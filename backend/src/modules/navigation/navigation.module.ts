import { Module } from "@nestjs/common";
import { NavigationController } from "./navigation.controller";
import { GEOCODING_PROVIDER } from "./providers/geocoding-provider.interface";
import { GoogleGeocodingProvider } from "./providers/google-geocoding.provider";
import { GoogleRoutingProvider } from "./providers/google-routing.provider";
import { ROUTING_PROVIDER } from "./providers/routing-provider.interface";

/**
 * Único punto donde se decide QUÉ implementación concreta responde a
 * `RoutingProvider`/`GeocodingProvider`. Cambiar de Google a otro proveedor
 * en el futuro es cambiar el `useClass` de estos dos bindings — el
 * controller y cualquier otro consumidor futuro (Emergency Corridor, Modo
 * Conducción) siguen dependiendo solo de la interfaz.
 */
@Module({
  controllers: [NavigationController],
  providers: [
    { provide: ROUTING_PROVIDER, useClass: GoogleRoutingProvider },
    { provide: GEOCODING_PROVIDER, useClass: GoogleGeocodingProvider },
  ],
  exports: [ROUTING_PROVIDER, GEOCODING_PROVIDER],
})
export class NavigationModule {}
