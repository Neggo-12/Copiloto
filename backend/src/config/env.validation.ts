/**
 * Validación de variables de entorno al arrancar el backend — falla rápido y
 * claro en vez de arrancar a medias con `undefined` silencioso.
 *
 * REDIS_URL: decisión oficial del proyecto (ADR-0008) — Upstash Redis, un
 * único connection string ("rediss://default:<password>@<host>:<port>",
 * TLS incluido en el esquema). Requerido: Redis/BullMQ ya son infraestructura
 * real del proyecto, no una pieza opcional.
 */
export interface EnvConfig {
  NODE_ENV: "development" | "production" | "test";
  PORT: number;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  REDIS_URL: string;
}

const REQUIRED_KEYS = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "REDIS_URL"] as const;

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
    REDIS_URL: raw.REDIS_URL as string,
  };
}
