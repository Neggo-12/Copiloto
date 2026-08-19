import { Controller, Get, NotFoundException, Param, Post } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import type { Queue } from "bullmq";
import { QUEUE_NAMES, SYSTEM_JOB_NAMES, type SystemPingJobData, type SystemPingJobResult } from "../../common/queue/queue-names";

/**
 * Sin auth a propósito: es infraestructura interna para probar que
 * Redis+BullMQ+worker funcionan de punta a punta, no un endpoint de
 * negocio. Si se despliega a un entorno público, debería quedar detrás de
 * un guard interno — anotado, no resuelto aquí porque el hosting de
 * producción todavía no está decidido (ver ADR-0008 "riesgos").
 */
@Controller("system/queue")
export class SystemQueueController {
  constructor(@InjectQueue(QUEUE_NAMES.SYSTEM) private readonly systemQueue: Queue<SystemPingJobData, SystemPingJobResult, string>) {}

  @Post("ping")
  async enqueuePing(): Promise<{ jobId: string }> {
    const job = await this.systemQueue.add(SYSTEM_JOB_NAMES.PING, {
      requestedAt: new Date().toISOString(),
      note: "smoke test Fase 1 — Redis/BullMQ",
    });

    if (!job.id) {
      throw new Error("BullMQ no asignó id al job encolado");
    }

    return { jobId: job.id };
  }

  @Get("ping/:jobId")
  async getPingResult(@Param("jobId") jobId: string): Promise<{ state: string; result: SystemPingJobResult | null }> {
    const job = await this.systemQueue.getJob(jobId);
    if (!job) {
      throw new NotFoundException(`No existe el job '${jobId}' en la cola '${QUEUE_NAMES.SYSTEM}'`);
    }

    const state = await job.getState();
    return { state, result: job.returnvalue ?? null };
  }
}
