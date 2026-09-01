import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { EnvConfig } from "../../config/env.validation";
import type { AuthenticatedRequest } from "./supabase-auth.guard";

/**
 * Autorización de "administrador maestro" del Emergency Corridor — hoy es
 * literalmente UNA persona (el fundador), identificada por su propio
 * `user_id` real de Supabase Auth vía `ADMIN_USER_ID` (variable de entorno,
 * nunca hardcodeada, nunca decidida por el cliente). Se usa SIEMPRE después
 * de `SupabaseAuthGuard` (`@UseGuards(SupabaseAuthGuard, AdminGuard)`) —
 * depende de que `request.userId` ya esté puesto por un JWT real ya
 * verificado, nunca confía en nada que venga del cliente.
 *
 * Deliberadamente NO es un sistema de roles genérico (tabla `admins`,
 * columna `profiles.role`, etc.) — no hay evidencia todavía de que haga
 * falta más de un administrador. Si eso cambia, esto se reemplaza por algo
 * más general; construirlo ahora sería complejidad sin evidencia (regla del
 * proyecto). Falla CERRADO si `ADMIN_USER_ID` no está configurado — nunca
 * deja pasar a nadie por accidente.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly config: ConfigService<EnvConfig, true>) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const adminUserId = this.config.get("ADMIN_USER_ID", { infer: true });

    if (!adminUserId || request.userId !== adminUserId) {
      throw new ForbiddenException("Solo el administrador puede hacer esto.");
    }
    return true;
  }
}
