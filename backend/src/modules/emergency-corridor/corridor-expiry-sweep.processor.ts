import { InjectQueue, Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger, type OnModuleInit } from "@nestjs/common";
import type { Job, Queue } from "bullmq";
import {
  EMERGENCY_ALERTS_JOB_NAMES,
  QUEUE_NAMES,
  type CorridorExpirySweepJobData,
  type CorridorExpirySweepJobResult,
} from "../../common/queue/queue-names";
import { AlertPolicyService } from "./alert-policy.service";

/**
 * Cada cuánto corre el barrido — no necesita ser fino: el TTL que detecta
 * (`RouteSessionService`, 4h) ya es una espera larga, así que una demora de
 * hasta 15 minutos en avisar "ya pasó" después de esa expiración silenciosa
 * es insignificante frente al problema que resuelve (antes: nunca se
 * avisaba). Ver ADR-0020 — quedó diferido a propósito hasta tener evidencia
 * real de que hacía falta cerrarlo.
 */
const SWEEP_INTERVAL_MS = 15 * 60 * 1000;

/**
 * Id fijo del scheduler a propósito: `queue.upsertJobScheduler(id, ...)` es
 * un upsert real (BullMQ v6 — `repeat` en `queue.add()` fue removido de
 * `JobsOptions`, confirmado contra los tipos reales instalados, no
 * adivinado) — con el mismo id, reiniciar el backend (cada deploy, cada
 * restart) reemplaza la programación existente en vez de crear un segundo
 * barrido corriendo en paralelo.
 */
const SWEEP_JOB_ID = "corridor-expiry-sweep";

/**
 * Primer processor real de la cola `EMERGENCY_ALERTS` (reservada desde
 * ADR-0008, sin consumidor hasta hoy). Se registra su propio job repetible
 * al arrancar el módulo (`onModuleInit`) en vez de depender de que algo
 * externo lo encole — es un barrido de mantenimiento, no una reacción a un
 * evento de dominio.
 */
@Processor(QUEUE_NAMES.EMERGENCY_ALERTS)
export class CorridorExpirySweepProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(CorridorExpirySweepProcessor.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.EMERGENCY_ALERTS)
    private readonly queue: Queue<CorridorExpirySweepJobData, CorridorExpirySweepJobResult, string>,
    private readonly alertPolicy: AlertPolicyService,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    await this.queue.upsertJobScheduler(SWEEP_JOB_ID, { every: SWEEP_INTERVAL_MS }, {
      name: EMERGENCY_ALERTS_JOB_NAMES.CORRIDOR_EXPIRY_SWEEP,
      data: {},
    });
  }

  async process(
    job: Job<CorridorExpirySweepJobData, CorridorExpirySweepJobResult, string>,
  ): Promise<CorridorExpirySweepJobResult> {
    if (job.name !== EMERGENCY_ALERTS_JOB_NAMES.CORRIDOR_EXPIRY_SWEEP) {
      throw new Error(`Job desconocido en la cola '${QUEUE_NAMES.EMERGENCY_ALERTS}': ${job.name}`);
    }

    const expired = await this.alertPolicy.sweepExpired();
    if (expired.length > 0) {
      this.logger.log(`Barrido de expiración: ${expired.length} corredor(es) cerrados por expiración silenciosa`);
    }
    return { expiredCount: expired.length };
  }
}
