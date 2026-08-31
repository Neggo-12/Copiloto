import { BadRequestException, Body, Controller, Delete, Get, Inject, Post, Query, Req, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { AuthenticatedRequest } from "../../common/guards/supabase-auth.guard";
import { SupabaseAuthGuard } from "../../common/guards/supabase-auth.guard";
import { LocationStateService } from "../location/location-state.service";
import { RouteSessionService } from "../route-session/route-session.service";
import { GEOCODING_PROVIDER, type GeocodingProvider } from "./providers/geocoding-provider.interface";
import { ROUTING_PROVIDER, type RoutingProvider, type TravelMode } from "./providers/routing-provider.interface";

interface ComputeRouteBody {
  origin: { latitude: number; longitude: number };
  destination: { latitude: number; longitude: number };
  travelMode: TravelMode;
}

interface StartRouteSessionBody {
  destination: { latitude: number; longitude: number };
  travelMode: TravelMode;
}

/**
 * Endpoints delgados: la lógica real vive en los adapters
 * (`RoutingProvider`/`GeocodingProvider`) y en los servicios de estado
 * (`RouteSessionService`, `LocationStateService`), no aquí. Protegidos con
 * `SupabaseAuthGuard` porque cada llamada de routing/geocoding tiene costo
 * real en Google Maps Platform — nunca exponerlos sin autenticación.
 *
 * Rate limit más estricto que el default global (20/min en vez de 60/min,
 * ver `RateLimitModule`): cada llamada aquí es dinero real gastado en
 * Google Maps Platform, no solo cómputo interno.
 */
@Controller("navigation")
@UseGuards(SupabaseAuthGuard)
@Throttle({ default: { limit: 20, ttl: 60_000 } })
export class NavigationController {
  constructor(
    @Inject(ROUTING_PROVIDER) private readonly routingProvider: RoutingProvider,
    @Inject(GEOCODING_PROVIDER) private readonly geocodingProvider: GeocodingProvider,
    private readonly locationState: LocationStateService,
    private readonly routeSession: RouteSessionService,
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

  /**
   * Arranca una ruta activa: el origen es la última ubicación conocida del
   * usuario (Location Engine, ADR-0009) — no se recibe por body, para no
   * confiar en un origen que el cliente pueda inventar y para que el punto
   * de partida sea siempre el mismo dato que ya valida/normaliza el motor de
   * ubicación. A partir de aquí, cada `location:update` por WebSocket
   * calcula si el usuario sigue sobre esta ruta (ver `LocationGateway`).
   */
  @Post("route-session")
  async startRouteSession(@Req() request: AuthenticatedRequest, @Body() body: StartRouteSessionBody) {
    if (!body?.destination || !body?.travelMode) {
      throw new BadRequestException("destination y travelMode son requeridos.");
    }

    const currentLocation = await this.locationState.getCurrent(request.userId);
    if (!currentLocation) {
      throw new BadRequestException(
        "No hay ubicación actual registrada para este usuario — reporta al menos una posición por WebSocket antes de arrancar una ruta.",
      );
    }

    const origin = { latitude: currentLocation.location.latitude, longitude: currentLocation.location.longitude };
    const route = await this.routingProvider.computeRoute({ origin, destination: body.destination, travelMode: body.travelMode });

    await this.routeSession.start(request.userId, {
      origin,
      destination: body.destination,
      encodedPolyline: route.encodedPolyline,
      distanceMeters: route.distanceMeters,
      durationSeconds: route.durationSeconds,
      startedAt: Date.now(),
    });

    return route;
  }

  @Delete("route-session")
  async clearRouteSession(@Req() request: AuthenticatedRequest) {
    await this.routeSession.clear(request.userId);
    return { cleared: true };
  }
}
