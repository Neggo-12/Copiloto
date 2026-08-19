import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import type { Job } from "bullmq";
import { QUEUE_NAMES, SYSTEM_JOB_NAMES, type SystemPingJobData, type SystemPingJobResult } from "../../common/queue/queue-names";

@Processor(QUEUE_NAMES.SYSTEM)
export class SystemQueueProcessor extends WorkerHost {
  private readonly logger = new Logger(SystemQueueProcessor.name);

  process(job: Job<SystemPingJobData, SystemPingJobResult, string>): Promise<SystemPingJobResult> {
    if (job.name !== SYSTEM_JOB_NAMES.PING) {
      return Promise.reject(new Error(`Job desconocido en la cola '${QUEUE_NAMES.SYSTEM}': ${job.name}`));
    }

    this.logger.log(`ping recibido (encolado en ${job.data.requestedAt}): ${job.data.note ?? "(sin nota)"}`);

    return Promise.resolve({ pong: true, respondedAt: new Date().toISOString() });
  }
}
