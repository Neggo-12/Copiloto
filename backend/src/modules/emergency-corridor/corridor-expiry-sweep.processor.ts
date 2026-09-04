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

  /**
   * CAUSA RAÍZ real de una caída total confirmada el 2026-09-04 (logs reales
   * de Railway): con la cuota de Upstash agotada (mismo hallazgo de la
   * decisión (28)), este `upsertJobScheduler` lanzaba una excepción real
   * durante el arranque — y como `onModuleInit` de Nest se espera (`await`)
   * dentro de `NestFactory.create()` en `main.ts`, esa excepción tumbaba TODO
   * el proceso (no solo esta cola): `bootstrap()` se llama como
   * `void bootstrap()` sin `.catch()`, así que el rechazo quedaba sin
   * manejar y Bun mataba el proceso — Railway lo reiniciaba de inmediato,
   * volvía a fallar igual, y quedaba en loop de reinicio infinito (confirmado
   * en los logs: "Starting Nest application..." cada 1-3s, sin nunca llegar
   * a "escuchando en :PORT"). Con esto, NINGÚN endpoint del backend
   * respondía — no solo los que tocan Redis.
   *
   * Try/catch real a propósito: este barrido es mantenimiento de baja
   * precisión (ver comentario de `SWEEP_INTERVAL_MS` arriba — "no necesita
   * ser fino"), así que perderlo temporalmente por un problema de
   * infraestructura de Redis es aceptable; que TODO el backend deje de
   * arrancar por eso no lo es. Esto NO arregla la cuota de Upstash en sí
   * (eso sigue siendo una acción real de cuenta/plan del fundador, ver
   * decisión (28)) — solo evita que un problema de Redis se propague a una
   * caída total del backend.
   */
  async onModuleInit(): Promise<void> {
    try {
      await this.queue.upsertJobScheduler(SWEEP_JOB_ID, { every: SWEEP_INTERVAL_MS }, {
        name: EMERGENCY_ALERTS_JOB_NAMES.CORRIDOR_EXPIRY_SWEEP,
        data: {},
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error desconocido";
      this.logger.warn(
        `No se pudo programar el barrido de expiración de corredores (Redis) — el resto del backend sigue arrancando normalmente. Causa: ${message}`,
      );
    }
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
