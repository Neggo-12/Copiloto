import { Module } from "@nestjs/common";
import { RouteSessionService } from "./route-session.service";

/**
 * No es `@Global()` a propósito — a diferencia de Supabase/Redis/Queue
 * (infraestructura transversal real), `RouteSessionService` es estado de
 * dominio de un caso de uso concreto (seguimiento de ruta). Se importa
 * explícitamente donde se necesita (`LocationModule`, `NavigationModule`)
 * para que el grafo de dependencias siga siendo legible.
 */
@Module({
  providers: [RouteSessionService],
  exports: [RouteSessionService],
})
export class RouteSessionModule {}
