import { Inject, Injectable, Logger } from "@nestjs/common";
import type { Redis } from "ioredis";
import { REDIS_CONNECTION } from "../../common/redis/redis.module";
import { DrivingModeService } from "../vehicles/driving-mode.service";
import type { VehicleType } from "../vehicles/vehicles.types";
import { LocationBroadcastService } from "../location/location-broadcast.service";
import type { CorridorCandidate, CorridorCloseReason } from "./emergency-corridor.types";

/**
 * Mensaje base (definido por el fundador desde la visión completa del
 * producto). El texto es el mismo para todos a propósito — el fundador dio
 * una sola frase exacta, no dos; inventar redacciones distintas para
 * carro/moto sin que él las apruebe sería una decisión de producto que no
 * es de este backend tomar. Lo que SÍ se diferencia ahora (2026-08-19, ver
 * ADR-0017) es `recommendedChannel` — carro: visual+audio, moto: voz
 * prioritaria — usando el Modo de manejo real del candidato (ADR-0014, ya
 * no era un dato faltante). El cliente (todavía sin construir) decide cómo
 * renderizar cada canal; el backend solo le dice cuál corresponde.
 */
export const BASE_ALERT_MESSAGE = "Ambulancia aproximándose. Facilite el paso cuando sea seguro hacerlo.";

export type AlertChannel = "visual_audio" | "voice_priority" | "default";

/**
 * "default" es el candidato que nunca fijó Modo de manejo — no es un error,
 * es la mayoría de los casos hasta que la app cliente pida esta decisión en
 * el onboarding o el asistente pregunte "¿vas en el carro o en la moto?".
 */
function recommendedChannelFor(vehicleType: VehicleType | null): AlertChannel {
  if (vehicleType === "car") return "visual_audio";
  if (vehicleType === "motorcycle") return "voice_priority";
  return "default";
}

/**
 * Cuánto tiempo pasa antes de poder volver a alertar al MISMO candidato por
 * la MISMA ambulancia. Evita spamear a alguien que sigue dentro del buffer
 * en cada consulta sucesiva. También actúa como "expiración" implícita: si
 * el candidato ya no está en conflicto cuando pase el cooldown, simplemente
 * no vuelve a aparecer en `findCandidates()` y no se le alerta de nuevo.
 */
const ALERT_COOLDOWN_SECONDS = 30;

/**
 * Cuánto vive el set de "a quién se alertó durante este traslado" (ver
 * `alertedSetKey`) si nadie cierra el corredor a mano. Se fija igual al TTL
 * de `RouteSessionService.SESSION_TTL_SECONDS` (4h) a propósito: el set no
 * tiene sentido sobrevivir más que la ruta que lo originó. No se importa la
 * constante entre módulos (evitar un acoplamiento innecesario por un solo
 * número) — si alguna cambia, ambas se revisan juntas.
 */
const ALERTED_SET_TTL_SECONDS = 4 * 60 * 60;

function alertStateKey(ambulanceDriverId: string, candidateUserId: string): string {
  return `corridor:alert:${ambulanceDriverId}:${candidateUserId}`;
}

/** Quiénes fueron alertados durante el traslado ACTIVO de esta ambulancia — distinto del cooldown por par (`alertStateKey`), que solo evita spam repetido. Este set es lo que permite avisarles "ya pasó" al cerrar el corredor. */
function alertedSetKey(ambulanceDriverId: string): string {
  return `corridor:alerted:${ambulanceDriverId}`;
}

export interface AlertDispatchResult {
  alerted: string[];
  skippedByCooldown: string[];
}

/**
 * Decide A QUIÉN alertar (dedup + cooldown) y lo manda por el mismo socket
 * de `/location` que el candidato ya tiene abierto para reportar su
 * ubicación — no se abre un canal nuevo. Dedup real vía `SET NX EX` en
 * Redis: atómico, sin condición de carrera entre dos evaluaciones
 * concurrentes para el mismo par ambulancia/candidato.
 */
@Injectable()
export class AlertPolicyService {
  private readonly logger = new Logger(AlertPolicyService.name);

  constructor(
    @Inject(REDIS_CONNECTION) private readonly redis: Redis,
    private readonly broadcast: LocationBroadcastService,
    private readonly drivingMode: DrivingModeService,
  ) {}

  async evaluateAndDispatch(ambulanceDriverId: string, candidates: CorridorCandidate[]): Promise<AlertDispatchResult> {
    const alerted: string[] = [];
    const skippedByCooldown: string[] = [];

    for (const candidate of candidates) {
      const key = alertStateKey(ambulanceDriverId, candidate.userId);
      const acquired = await this.redis.set(key, "1", "EX", ALERT_COOLDOWN_SECONDS, "NX");

      if (acquired !== "OK") {
        skippedByCooldown.push(candidate.userId);
        continue;
      }

      const vehicleType = await this.drivingMode.get(candidate.userId);
      const recommendedChannel = recommendedChannelFor(vehicleType);

      this.broadcast.notify(candidate.userId, "corridor:alert", {
        message: BASE_ALERT_MESSAGE,
        distanceMeters: candidate.distanceMeters,
        severity: candidate.severity,
        ambulanceDriverId,
        recommendedChannel,
      });
      alerted.push(candidate.userId);

      const setKey = alertedSetKey(ambulanceDriverId);
      await this.redis.sadd(setKey, candidate.userId);
      await this.redis.expire(setKey, ALERTED_SET_TTL_SECONDS);
    }

    if (alerted.length > 0) {
      this.logger.log(`Ambulancia ${ambulanceDriverId}: ${alerted.length} candidato(s) alertado(s), ${skippedByCooldown.length} en cooldown`);
    }

    return { alerted, skippedByCooldown };
  }

  /**
   * Cierra el corredor de esta ambulancia: le avisa `corridor:closed` a
   * TODOS los candidatos alertados durante el traslado (no solo el último
   * lote) y limpia el set — un corredor cerrado no debe dejar rastro de
   * "alertado pendiente de resolver". No toca los cooldowns por par
   * (`alertStateKey`) — esos ya expiran solos en 30s y no bloquean nada.
   */
  async closeCorridor(ambulanceDriverId: string, reason: CorridorCloseReason): Promise<string[]> {
    const setKey = alertedSetKey(ambulanceDriverId);
    const notified = await this.redis.smembers(setKey);

    if (notified.length > 0) {
      await this.redis.del(setKey);
      for (const userId of notified) {
        this.broadcast.notify(userId, "corridor:closed", { ambulanceDriverId, reason });
      }
      this.logger.log(`Ambulancia ${ambulanceDriverId}: corredor cerrado (${reason}), ${notified.length} candidato(s) notificado(s)`);
    }

    return notified;
  }
}
