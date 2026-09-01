import { Inject, Injectable, Logger } from "@nestjs/common";
import type { Redis } from "ioredis";
import { REDIS_CONNECTION } from "../../common/redis/redis.module";
import { haversineMeters } from "../../common/geo/haversine";
import { pointAtDistanceAlongPath } from "../../common/geo/interpolate";
import { decodePolyline } from "../../common/geo/polyline";
import type { LatLng } from "../../common/geo/types";
import { LocationStateService } from "../location/location-state.service";
import { ROUTING_PROVIDER, type RoutingProvider } from "../navigation/providers/routing-provider.interface";
import { computeDeviation } from "../route-session/route-deviation";
import type { ActiveRouteSession } from "../route-session/route-session.types";
import { RouteSessionService } from "../route-session/route-session.service";
import type { CorridorCandidate, CorridorSeverity } from "./emergency-corridor.types";

/**
 * Buffer dinámico por velocidad (ver ADR-0021): reemplaza el radio fijo de
 * 200m del primer slice. Un radio fijo se queda corto cuando la ambulancia
 * va rápido (menos tiempo real de reacción para el candidato) y sobra
 * cuando va despacio o detenida (alerta a gente que no tiene nada que
 * despejar todavía). El fundador delegó explícitamente los números de esta
 * decisión ("la decisión se la dejo a usted, tome la mejor") — valores
 * elegidos con una justificación concreta, no arbitraria, y documentados
 * como ajustables con evidencia real de uso, no como definitivos.
 */
const MIN_BUFFER_METERS = 150;
const MAX_BUFFER_METERS = 400;
/**
 * Segundos de reacción que se le da a un candidato para detectar la alerta
 * y despejar el paso — 8s es una cifra conservadora típica de "percibir +
 * decidir + maniobrar" en tránsito urbano (más que el tiempo de reacción
 * simple ante un evento visual, porque acá el candidato además tiene que
 * mover el vehículo). A 80km/h (22.2 m/s), 8s de margen ya llenan el techo
 * de 400m; a 20km/h o detenida, el mínimo de 150m es suficiente sin
 * sobre-alertar innecesariamente.
 */
const REACTION_TIME_SECONDS = 8;

/** Exportada (no solo interna) para que `SimulationEngineService` pueda reportar el mismo número real usado en la detección, en vez de adivinarlo — ver ADR-0022. */
export function dynamicBufferMeters(speedMetersPerSecond: number | null): number {
  if (speedMetersPerSecond === null || speedMetersPerSecond <= 0) return MIN_BUFFER_METERS;
  const grown = MIN_BUFFER_METERS + speedMetersPerSecond * REACTION_TIME_SECONDS;
  return Math.min(MAX_BUFFER_METERS, Math.round(grown));
}

/** Fracciones del buffer que separan `critical`/`warning`/`info` — ver el comentario de `CorridorSeverity`. */
const CRITICAL_BUFFER_FRACTION = 0.25;
const WARNING_BUFFER_FRACTION = 0.6;

function severityFor(distanceMeters: number, bufferMeters: number): CorridorSeverity {
  if (distanceMeters <= bufferMeters * CRITICAL_BUFFER_FRACTION) return "critical";
  if (distanceMeters <= bufferMeters * WARNING_BUFFER_FRACTION) return "warning";
  return "info";
}

/**
 * Cada cuántos METROS reales (no puntos crudos del polyline) se toma una
 * muestra hacia adelante. Antes se muestreaba cada N-ésimo punto del array
 * decodificado — funcionaba con una polyline densa (curvas/calles reales de
 * Google, muchos puntos), pero con pocos waypoints (ej. un tramo recto
 * corto) el muestreo por índice dejaba huecos reales sin cubrir en el
 * corredor: un candidato a mitad de ruta podía no aparecer NUNCA aunque
 * estuviera dentro del buffer, porque solo se consultaban los waypoints
 * originales, no puntos intermedios reales. Encontrado con el simulador
 * (Fase 7, ver ADR-0022), corregido a muestreo por distancia real
 * (`pointAtDistanceAlongPath`) — funciona igual sin importar cuántos
 * waypoints traiga la polyline de entrada.
 */
const SAMPLE_DISTANCE_METERS = 100;
/** Tope de muestras hacia adelante: cada muestra es una llamada real a Redis, así que se limita el costo por consulta. 20 muestras × 100m cubren 2km de corredor por delante de la ambulancia — suficiente para un primer slice urbano. */
const MAX_LOOKAHEAD_SAMPLES = 20;

/**
 * Cooldown real entre recálculos de ruta contra Google Routes API para la
 * MISMA ambulancia, mientras siga fuera de ruta. El cliente de la ambulancia
 * consulta `GET /emergency/corridor/candidates` cada 5-10s (ver doc de
 * `EmergencyCorridorController`) — sin cooldown, cada una de esas consultas
 * mientras el desvío sigue activo dispararía una llamada real (con costo
 * real) a Google Routes. 30s deja que el corredor se corrija rápido de
 * verdad (2-6 consultas de margen, no minutos) sin pagar por cada poll
 * individual, y protege contra recalcular en bucle si el GPS solo está
 * oscilando alrededor del umbral de 60m (`OFF_ROUTE_THRESHOLD_METERS`).
 * Regla del propio proyecto: "no recalcular ni notificar innecesariamente".
 */
const REROUTE_COOLDOWN_SECONDS = 30;

function rerouteCooldownKey(ambulanceDriverId: string): string {
  return `corridor:reroute-cooldown:${ambulanceDriverId}`;
}

/**
 * El "corredor" de una ambulancia ES su ruta activa (`RouteSessionService`,
 * ya construido en ADR-0011) — no se duplica esa noción. Este servicio solo
 * agrega la pregunta específica de Emergency Corridor: "¿qué otros usuarios
 * están dentro del buffer, mirando hacia adelante desde donde va la
 * ambulancia ahora?". Reusa `computeDeviation`'s misma idea (punto más
 * cercano de la ruta a la posición actual) para saber desde dónde empezar a
 * mirar hacia adelante.
 */
@Injectable()
export class EmergencyCorridorService {
  private readonly logger = new Logger(EmergencyCorridorService.name);

  constructor(
    private readonly routeSession: RouteSessionService,
    private readonly locationState: LocationStateService,
    @Inject(REDIS_CONNECTION) private readonly redis: Redis,
    @Inject(ROUTING_PROVIDER) private readonly routingProvider: RoutingProvider,
  ) {}

  /**
   * `null` si la ambulancia no tiene una ruta activa (no arrancó ninguna
   * todavía, o ya llegó/canceló) — no es un error, es el estado normal
   * fuera de un traslado.
   */
  async findCandidates(ambulanceDriverId: string): Promise<CorridorCandidate[] | null> {
    const activeRoute = await this.routeSession.getActive(ambulanceDriverId);
    if (!activeRoute) return null;

    const currentLocation = await this.locationState.getCurrent(ambulanceDriverId);
    const currentPosition: LatLng = currentLocation
      ? { latitude: currentLocation.location.latitude, longitude: currentLocation.location.longitude }
      : activeRoute.origin;

    const bufferMeters = dynamicBufferMeters(currentLocation?.location.speed ?? null);

    const routePoints = decodePolyline(activeRoute.encodedPolyline);
    // Si el conductor se desvió de la ruta planeada más allá del umbral real
    // (mismo `computeDeviation`/60m que ya usa `location.gateway.ts` para
    // avisarle A ÉL "te saliste de tu ruta") la ruta planeada ya no sirve de
    // guía hacia adelante: seguir muestreando sobre ella deja de proteger a
    // quien está en el camino REAL y sigue "protegiendo" el camino
    // abandonado (encontrado con el simulador, escenario 4 — ver ADR-0022).
    // Primero se intenta un recálculo REAL contra Google Routes (`tryReroute`,
    // con cooldown — ver `REROUTE_COOLDOWN_SECONDS`) para volver a tener una
    // ruta de verdad hacia el destino desde donde está la ambulancia ahora
    // (2026-09-01, decisión explícita del fundador de construirlo — antes
    // quedó diferido a propósito por el costo real de la API). Si el
    // recálculo no aplica todavía (cooldown activo) o falla (API caída, sin
    // key configurada), cae al mismo fallback que antes: proteger el radio
    // alrededor de la posición ACTUAL en vez de mirar hacia adelante sobre
    // una ruta abandonada — sigue siendo seguro, solo menos preciso.
    const deviation = computeDeviation(currentPosition, routePoints);
    let samples: LatLng[];
    if (deviation.offRoute) {
      const reroutedPoints = await this.tryReroute(ambulanceDriverId, activeRoute, currentPosition);
      samples = reroutedPoints ? this.sampleAhead(reroutedPoints, currentPosition) : [currentPosition];
    } else {
      samples = this.sampleAhead(routePoints, currentPosition);
    }

    const nearest = new Map<string, number>();
    for (const point of samples) {
      const candidates = await this.locationState.findNearby(point, bufferMeters);
      for (const candidate of candidates) {
        if (candidate.userId === ambulanceDriverId) continue;
        const existing = nearest.get(candidate.userId);
        if (existing === undefined || candidate.distanceMeters < existing) {
          nearest.set(candidate.userId, candidate.distanceMeters);
        }
      }
    }

    return Array.from(nearest.entries()).map(([userId, distanceMeters]) => ({
      userId,
      distanceMeters: Math.round(distanceMeters),
      state: "potential_conflict" as const,
      severity: severityFor(distanceMeters, bufferMeters),
    }));
  }

  /**
   * Recalcula la ruta REAL (Google Routes API, mismo `RoutingProvider` que
   * usa `POST /navigation/route-session`) desde la posición actual de la
   * ambulancia hasta su destino original, y sobrescribe la ruta activa en
   * `RouteSessionService` con el resultado — así la PRÓXIMA consulta del
   * corredor (y el propio chequeo de `LocationGateway` para el conductor)
   * ya ven la ruta corregida sin recalcular otra vez.
   *
   * `travelMode: "DRIVE"` fijo a propósito: esto es específico del corredor
   * de emergencia, donde el "usuario" siempre es una ambulancia (vehículo) —
   * no hay Modo de manejo moto/carro que aplique aquí como en
   * `AlertPolicyService.recommendedChannelFor` (eso es para el CANDIDATO
   * alertado, no para la ambulancia).
   *
   * `null` si no se pudo recalcular (cooldown activo o la API falló) — el
   * caller ya sabe cómo caer al fallback existente en ese caso.
   */
  private async tryReroute(
    ambulanceDriverId: string,
    activeRoute: ActiveRouteSession,
    currentPosition: LatLng,
  ): Promise<LatLng[] | null> {
    const acquired = await this.redis.set(rerouteCooldownKey(ambulanceDriverId), "1", "EX", REROUTE_COOLDOWN_SECONDS, "NX");
    if (acquired !== "OK") return null;

    try {
      const recalculated = await this.routingProvider.computeRoute({
        origin: currentPosition,
        destination: activeRoute.destination,
        travelMode: "DRIVE",
      });

      await this.routeSession.start(ambulanceDriverId, {
        ...activeRoute,
        encodedPolyline: recalculated.encodedPolyline,
        distanceMeters: recalculated.distanceMeters,
        durationSeconds: recalculated.durationSeconds,
      });

      this.logger.log(`Ambulancia ${ambulanceDriverId}: ruta recalculada real (Google Routes) tras desvío detectado.`);
      return decodePolyline(recalculated.encodedPolyline);
    } catch (error) {
      this.logger.error(
        `Ambulancia ${ambulanceDriverId}: fallo al recalcular ruta real tras desvío, usando fallback de posición actual — ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }

  /**
   * Encuentra el waypoint de la ruta más cercano a la posición actual (mismo
   * cálculo que `route-deviation.ts`), convierte eso a una distancia
   * acumulada desde el inicio de la ruta, y muestrea puntos desde ahí hacia
   * adelante CADA `SAMPLE_DISTANCE_METERS` METROS REALES (no cada N-ésimo
   * punto crudo — ver el comentario de `SAMPLE_DISTANCE_METERS`), con un
   * tope de muestras.
   */
  private sampleAhead(routePoints: LatLng[], currentPosition: LatLng): LatLng[] {
    if (routePoints.length === 0) return [currentPosition];

    let nearestIndex = 0;
    let nearestDistance = Infinity;
    routePoints.forEach((point, index) => {
      const distance = haversineMeters(currentPosition, point);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });

    let cumulativeAtNearest = 0;
    for (let i = 1; i <= nearestIndex; i++) {
      cumulativeAtNearest += haversineMeters(routePoints[i - 1], routePoints[i]);
    }

    const sampled: LatLng[] = [];
    for (let i = 0; i < MAX_LOOKAHEAD_SAMPLES; i++) {
      const point = pointAtDistanceAlongPath(routePoints, cumulativeAtNearest + i * SAMPLE_DISTANCE_METERS);
      if (point === null) break;
      sampled.push(point);
    }
    return sampled.length > 0 ? sampled : [currentPosition];
  }
}
