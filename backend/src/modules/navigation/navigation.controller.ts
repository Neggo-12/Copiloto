import { BadRequestException, Body, Controller, Get, Inject, Post, Query, UseGuards } from "@nestjs/common";
import { SupabaseAuthGuard } from "../../common/guards/supabase-auth.guard";
import { GEOCODING_PROVIDER, type GeocodingProvider } from "./providers/geocoding-provider.interface";
import { ROUTING_PROVIDER, type RoutingProvider, type TravelMode } from "./providers/routing-provider.interface";

interface ComputeRouteBody {
  origin: { latitude: number; longitude: number };
  destination: { latitude: number; longitude: number };
  travelMode: TravelMode;
}

/**
 * Endpoints delgados: la lógica real vive en los adapters
 * (`RoutingProvider`/`GeocodingProvider`), no aquí. Protegidos con
 * `SupabaseAuthGuard` porque cada llamada tiene costo real en Google Maps
 * Platform — nunca exponer sin autenticación.
 */
@Controller("navigation")
@UseGuards(SupabaseAuthGuard)
export class NavigationController {
  constructor(
    @Inject(ROUTING_PROVIDER) private readonly routingProvider: RoutingProvider,
    @Inject(GEOCODING_PROVIDER) private readonly geocodingProvider: GeocodingProvider,
  ) {}

  @Post("route")
  computeRoute(@Body() body: ComputeRouteBody) {
    if (!body?.origin || !body?.destination || !body?.travelMode) {
      throw new BadRequestException("origin, destination y travelMode son requeridos.");
    }
    return this.routingProvider.computeRoute(body);
  }

  @Get("geocode")
  geocode(@Query("address") address: string) {
    if (!address) {
      throw new BadRequestException("El parámetro 'address' es requerido.");
    }
    return this.geocodingProvider.geocode(address);
  }

  @Get("reverse-geocode")
  reverseGeocode(@Query("lat") lat: string, @Query("lng") lng: string) {
    const latitude = Number(lat);
    const longitude = Number(lng);
    if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
      throw new BadRequestException("Los parámetros 'lat' y 'lng' deben ser numéricos.");
    }
    return this.geocodingProvider.reverseGeocode({ latitude, longitude });
  }
}
