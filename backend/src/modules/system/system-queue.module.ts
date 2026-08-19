import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { QUEUE_NAMES } from "../../common/queue/queue-names";
import { SystemQueueController } from "./system-queue.controller";
import { SystemQueueProcessor } from "./system-queue.processor";

@Module({
  imports: [BullModule.registerQueue({ name: QUEUE_NAMES.SYSTEM })],
  controllers: [SystemQueueController],
  providers: [SystemQueueProcessor],
})
export class SystemQueueModule {}
