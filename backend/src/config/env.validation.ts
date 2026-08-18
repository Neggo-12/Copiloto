/**
 * Validación de variables de entorno al arrancar el backend — falla rápido y
 * claro en vez de arrancar a medias con `undefined` silencioso.
 *
 * REDIS_URL es opcional en esta primera versión: Redis/BullMQ (Fase 1 del
 * cronograma) requieren que el fundador provisione un proveedor (Upstash,
 * Redis Cloud, etc. — ver docs/decisions/README.md "Pendiente de decidir").
 * El backend arranca sin Redis por ahora; los módulos que lo necesiten lo
 * exigirán explícitamente cuando se conecten.
 */
export interface EnvConfig {
  NODE_ENV: "development" | "production" | "test";
  PORT: number;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  REDIS_URL: string | null;
}

const REQUIRED_KEYS = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] as const;

export function validateEnv(raw: Record<string, unknown>): EnvConfig {
  const missing = REQUIRED_KEYS.filter((key) => !raw[key]);
  if (missing.length > 0) {
    throw new Error(
      `Faltan variables de entorno requeridas: ${missing.join(", ")}. ` +
        "Copia backend/.env.example a backend/.env y complétalo (nunca commitear el .env real).",
    );
  }

  return {
    NODE_ENV: (raw.NODE_ENV as EnvConfig["NODE_ENV"]) ?? "development",
    PORT: raw.PORT ? Number(raw.PORT) : 3001,
    SUPABASE_URL: raw.SUPABASE_URL as string,
    SUPABASE_SERVICE_ROLE_KEY: raw.SUPABASE_SERVICE_ROLE_KEY as string,
    REDIS_URL: (raw.REDIS_URL as string | undefined) ?? null,
  };
}
