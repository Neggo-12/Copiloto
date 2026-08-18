import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import type { Request } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_ADMIN_CLIENT } from "../supabase/supabase.module";

export interface AuthenticatedRequest extends Request {
  userId: string;
}

/**
 * Valida el JWT de Supabase Auth que manda el front-end (mismo mecanismo de
 * sesión ya usado por proyecto-mensajeria). Nunca confía en un user id que
 * venga en el body/query — regla global "nunca confiar en el rol enviado por
 * el cliente". El backend solo confía en lo que Supabase Auth confirma.
 */
@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  constructor(@Inject(SUPABASE_ADMIN_CLIENT) private readonly supabase: SupabaseClient) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authHeader = request.headers.authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : null;

    if (!token) {
      throw new UnauthorizedException("Falta el header Authorization: Bearer <token>");
    }

    const { data, error } = await this.supabase.auth.getUser(token);
    if (error || !data.user) {
      throw new UnauthorizedException("Token inválido o expirado");
    }

    request.userId = data.user.id;
    return true;
  }
}
