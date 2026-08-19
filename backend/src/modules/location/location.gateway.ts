import { Inject, Logger, UnauthorizedException } from "@nestjs/common";
import { ConnectedSocket, MessageBody, OnGatewayConnection, SubscribeMessage, WebSocketGateway } from "@nestjs/websockets";
import type { Socket } from "socket.io";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_ADMIN_CLIENT } from "../../common/supabase/supabase.module";
import { decodePolyline } from "../../common/geo/polyline";
import { RouteSessionService } from "../route-session/route-session.service";
import { computeDeviation } from "../route-session/route-deviation";
import { LocationStateService } from "./location-state.service";
import { normalizeReport, validateRawReport } from "./location-normalizer";
import type { RawLocationReport } from "./location.types";

interface AuthenticatedSocket extends Socket {
  data: { userId: string };
}

/**
 * Canal realtime de tracking de ubicación. Namespace separado (`/location`)
 * para no mezclarse con otros canales futuros (ej. notificaciones).
 *
 * Autenticación en el handshake (mismo mecanismo que SupabaseAuthGuard, vía
 * `supabase.auth.getUser(token)`) — nunca confía en un userId que mande el
 * cliente en el payload del mensaje, solo en lo que el handshake autenticó.
 *
 * Sin estado ligado al socket más allá del userId: el estado real vive en
 * Redis (LocationStateService), así que una reconexión (red perdida, app en
 * background) retoma exactamente donde quedó sin lógica especial — soporta
 * "reconexión" y "tracking realtime" de la lista de requisitos sin necesitar
 * sesión pegajosa.
 */
@WebSocketGateway({ namespace: "location", cors: { origin: "*" } })
export class LocationGateway implements OnGatewayConnection {
  private readonly logger = new Logger(LocationGateway.name);

  constructor(
    @Inject(SUPABASE_ADMIN_CLIENT) private readonly supabase: SupabaseClient,
    private readonly locationState: LocationStateService,
    private readonly routeSession: RouteSessionService,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    const token = client.handshake.auth.token as string | undefined;
    if (!token) {
      this.logger.warn(`Conexión rechazada (sin token): ${client.id}`);
      client.emit("error", { message: "Falta token de autenticación" });
      client.disconnect(true);
      return;
    }

    const { data, error } = await this.supabase.auth.getUser(token);
    if (error || !data.user) {
      this.logger.warn(`Conexión rechazada (token inválido): ${client.id}`);
      client.emit("error", { message: "Token inválido o expirado" });
      client.disconnect(true);
      return;
    }

    (client as AuthenticatedSocket).data = { userId: data.user.id };
  }

  @SubscribeMessage("location:update")
  async handleLocationUpdate(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() raw: RawLocationReport,
  ): Promise<{
    accepted: boolean;
    quality?: string;
    rejectionReason?: string;
    route?: { onRoute: boolean; distanceFromRouteMeters: number };
  }> {
    const userId = client.data?.userId;
    if (!userId) {
      throw new UnauthorizedException("Socket sin sesión autenticada");
    }

    const previousState = await this.locationState.getCurrent(userId);
    const now = Date.now();
    const validation = validateRawReport(raw, now, previousState?.location ?? null);

    if (!validation.ok) {
      this.logger.warn(`Reporte rechazado de ${userId}: ${validation.rejectionReason}`);
      return { accepted: false, rejectionReason: validation.rejectionReason };
    }

    const normalized = normalizeReport(userId, raw, now, validation.quality);
    await this.locationState.setCurrent(normalized);

    const activeRoute = await this.routeSession.getActive(userId);
    let route: { onRoute: boolean; distanceFromRouteMeters: number } | undefined;
    if (activeRoute) {
      const routePoints = decodePolyline(activeRoute.encodedPolyline);
      const deviation = computeDeviation({ latitude: normalized.latitude, longitude: normalized.longitude }, routePoints);
      route = { onRoute: !deviation.offRoute, distanceFromRouteMeters: Math.round(deviation.distanceMeters) };
      if (deviation.offRoute) {
        this.logger.warn(`Usuario ${userId} se salió de su ruta activa (${route.distanceFromRouteMeters}m de la ruta)`);
      }
    }

    return { accepted: true, quality: validation.quality, route };
  }
}
