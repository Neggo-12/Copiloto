import { Module } from "@nestjs/common";
import { WebPushService } from "./web-push.service";

/**
 * Adapter de Web Push (ADR-0033). No es `@Global()` a propósito — quien
 * necesite `WebPushService` lo importa explícitamente, mismo criterio que
 * el resto de los módulos de este proyecto (ej. `QueueModule`).
 */
@Module({
  providers: [WebPushService],
  exports: [WebPushService],
})
export class PushNotificationsModule {}
