import { Inject, Injectable, Logger } from "@nestjs/common";
import type { Redis } from "ioredis";
import { REDIS_CONNECTION } from "../../common/redis/redis.module";
import { LocationBroadcastService } from "../location/location-broadcast.service";
import type { CorridorCandidate } from "./emergency-corridor.types";

/**
 * Mensaje base (definido por el fundador desde la visión completa del
 * producto). Diferenciar carro (visual+audio) vs. moto (voz prioritaria)
 * queda deliberadamente PENDIENTE: hoy no existe ningún dato de "en qué
 * vehículo va este usuario" — nadie lo pide ni lo guarda todavía. Enviar el
 * mismo mensaje a todos por ahora es honesto; fingir la diferenciación sin
 * el dato real sería simulación.
 */
export const BASE_ALERT_MESSAGE = "Ambulancia aproximándose. Facilite el paso cuando sea seguro hacerlo.";

/**
 * Cuánto tiempo pasa antes de poder volver a alertar al MISMO candidato por
 * la MISMA ambulancia. Evita spamear a alguien que sigue dentro del buffer
 * en cada consulta sucesiva. También actúa como "expiración" implícita: si
 * el candidato ya no está en conflicto cuando pase el cooldown, simplemente
 * no vuelve a aparecer en `findCandidates()` y no se le alerta de nuevo.
 */
const ALERT_COOLDOWN_SECONDS = 30;

function alertStateKey(ambulanceDriverId: string, candidateUserId: string): string {
  return `corridor:alert:${ambulanceDriverId}:${candidateUserId}`;
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

      this.broadcast.notify(candidate.userId, "corridor:alert", {
        message: BASE_ALERT_MESSAGE,
        distanceMeters: candidate.distanceMeters,
        ambulanceDriverId,
      });
      alerted.push(candidate.userId);
    }

    if (alerted.length > 0) {
      this.logger.log(`Ambulancia ${ambulanceDriverId}: ${alerted.length} candidato(s) alertado(s), ${skippedByCooldown.length} en cooldown`);
    }

    return { alerted, skippedByCooldown };
  }
}
