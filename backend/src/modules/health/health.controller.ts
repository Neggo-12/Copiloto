import { Controller, Get } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";

/** Sin rate limit — lo llaman monitores de infraestructura/uptime a intervalos cortos, no es una acción de negocio. */
@SkipThrottle()
@Controller("health")
export class HealthController {
  @Get()
  check(): { status: "ok"; service: string; timestamp: string } {
    return { status: "ok", service: "copiloto-backend", timestamp: new Date().toISOString() };
  }
}
