import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { SupabaseAuthGuard, type AuthenticatedRequest } from "../../common/guards/supabase-auth.guard";
import { AssistantToolsService } from "./assistant-tools.service";

interface ExecuteToolBody {
  args?: Record<string, unknown>;
  confirmed?: boolean;
}

/**
 * Superficie HTTP del Tool Registry (Fase 6, primer slice). Dos usos reales
 * hoy, sin esperar a que exista una sesión Realtime:
 *
 * 1. `GET /assistant/tools` — el futuro bootstrap de una sesión Realtime le
 *    pasa este mismo arreglo a OpenAI como config de `tools`, tal cual.
 * 2. `POST /assistant/tools/:toolName/execute` — cuando SÍ exista una
 *    sesión Realtime, el evento de function-call que mande OpenAI se
 *    traduce a esta misma llamada — es el mismo camino, no una versión de
 *    prueba aparte. Mientras tanto, es el punto real donde se puede probar
 *    cada tool con `curl` sin depender de ninguna cuenta de voz.
 */
@Controller("assistant")
@UseGuards(SupabaseAuthGuard)
export class AssistantController {
  constructor(private readonly tools: AssistantToolsService) {}

  @Get("tools")
  listTools() {
    return this.tools.list();
  }

  /** Rate limit más estricto que el default global (20/min en vez de 60/min): ejecutar una tool puede disparar acciones reales de dominio (Fase 6), no es una simple lectura. */
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post("tools/:toolName/execute")
  async executeTool(@Req() request: AuthenticatedRequest, @Param("toolName") toolName: string, @Body() body: ExecuteToolBody) {
    return this.tools.execute(toolName, { userId: request.userId, confirmed: body?.confirmed }, body?.args ?? {});
  }
}
