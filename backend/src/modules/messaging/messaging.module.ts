import { Module } from "@nestjs/common";
import { MessagingService } from "./messaging.service";

/**
 * Puente real hacia las tablas de chat que ya usa `proyecto-mensajeria`.
 * No importa nada de `SupabaseModule` explícitamente porque ese módulo es
 * `@Global()` — mismo patrón ya usado en el resto de los módulos.
 */
@Module({
  providers: [MessagingService],
  exports: [MessagingService],
})
export class MessagingModule {}
