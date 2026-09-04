import { ExecutionContext, HttpException, Injectable, Logger } from "@nestjs/common";
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
 *
 * "Fail open" real agregado 2026-09-04 (mismo día que el fix de
 * `corridor-expiry-sweep.processor.ts` — otro síntoma real del mismo
 * problema de fondo, la cuota de Upstash agotada, ver decisión (37)): este
 * guard es GLOBAL (`APP_GUARD`) y su storage es Redis
 * (`ThrottlerStorageRedisService`, `RateLimitModule`) — con la cuota
 * agotada, CADA petición a CUALQUIER endpoint (incluyendo login/lectura,
 * nada que ver con el rate limit en sí) tiraba una excepción sin capturar
 * dentro de `super.canActivate()`, que NestJS convertía en un 500 genérico
 * ("Internal server error") — confirmado real por el fundador probando el
 * panel de admin nuevo: el 500 no tenía nada que ver con `AdminGuard`, moría
 * ANTES de llegar ahí. Con `try/catch` alrededor de `super.canActivate()`:
 * si Redis falla, se deja pasar la petición (fail open) en vez de bloquear
 * el 100% del tráfico real por un límite que ni siquiera se puede consultar.
 * Trade-off real y aceptado a propósito: mientras Redis siga caído, los
 * límites más estrictos de endpoints costosos (proxy de Google Maps,
 * `SimulationController`, ver `RateLimitModule`) tampoco se aplican — un
 * riesgo real pero muchísimo menor que tener el 100% de la API caída.
 *
 * Importante: el "fail open" es SOLO para fallas de infraestructura (Redis
 * caído/sin cuota) — cuando alguien SÍ se pasó del límite real, `super.canActivate()`
 * lanza `ThrottlerException` (un `HttpException` real, 429, el caso normal y
 * esperado) y ese caso se re-lanza tal cual, nunca se convierte en "dejar
 * pasar". Distinguir por `instanceof HttpException` evita que este fix
 * termine desactivando el rate limit por completo en el caso normal.
 */
@Injectable()
export class UserAwareThrottlerGuard extends ThrottlerGuard {
  private readonly failOpenLogger = new Logger(UserAwareThrottlerGuard.name);

  override async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      return await super.canActivate(context);
    } catch (error) {
      if (error instanceof HttpException) {
        // Caso normal: de verdad se pasó del límite (429) u otro HttpException real del guard — no es una falla de Redis, no se debe "dejar pasar".
        throw error;
      }
      const message = error instanceof Error ? error.message : "Error desconocido";
      this.failOpenLogger.warn(`Rate limit no disponible (Redis) — dejando pasar la petición sin límite. Causa: ${message}`);
      return true;
    }
  }

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
