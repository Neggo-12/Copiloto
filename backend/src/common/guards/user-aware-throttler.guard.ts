import { Injectable } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";

/**
 * Agrupa el rate limit por USUARIO (`sub` del JWT), no por IP — con una
 * excepción de diseño real que vale la pena explicar:
 *
 * 1. Este guard corre GLOBAL (`APP_GUARD`, ver `RateLimitModule`), y los
 *    guards globales corren ANTES que los de controller — `SupabaseAuthGuard`
 *    (que llena `request.userId` verificando el token contra Supabase) es de
 *    controller, así que `request.userId` todavía no existe cuando esto
 *    corre. No se puede simplemente leer `request.userId` aquí.
 * 2. Por eso este guard decodifica el JWT él mismo — SIN verificar firma.
 *    Es seguro para este propósito puntual: el resultado solo se usa como
 *    clave de agrupación para contar peticiones, nunca como una decisión de
 *    autorización. Si alguien manda un token forjado con un `sub` falso, en
 *    el peor caso evade compartir su balde de rate-limit con su identidad
 *    real — igual necesita pasar `SupabaseAuthGuard` (que sí verifica de
 *    verdad) para que la petición haga algo.
 * 3. Agrupar por IP en cambio sería real y activamente incorrecto en el
 *    piloto (Fase 8: decenas/cientos de conductores en la misma red celular
 *    comparten IP pública por el NAT del operador) — penalizaría a usuarios
 *    inocentes por el tráfico de otro. Por IP solo se usa como respaldo
 *    cuando no hay token Bearer (ej. `/health`).
 */
@Injectable()
export class UserAwareThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(req: Record<string, any>): Promise<string> {
    const headers = (req as { headers?: Record<string, string | string[] | undefined> }).headers;
    const rawHeader = headers?.["authorization"];
    const authHeader = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : null;
    const userId = token ? decodeJwtSubUnsafe(token) : null;
    return userId ? `user:${userId}` : await super.getTracker(req);
  }
}

/** Decodifica el claim `sub` de un JWT sin verificar su firma — ver el porqué en el comentario de la clase. */
function decodeJwtSubUnsafe(token: string): string | null {
  try {
    const payloadSegment = token.split(".")[1];
    if (!payloadSegment) return null;
    const json = Buffer.from(payloadSegment, "base64url").toString("utf8");
    const payload = JSON.parse(json) as { sub?: unknown };
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}
