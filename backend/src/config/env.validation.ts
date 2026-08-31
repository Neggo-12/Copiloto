/**
 * Validación de variables de entorno al arrancar el backend — falla rápido y
 * claro en vez de arrancar a medias con `undefined` silencioso.
 *
 * REDIS_URL: decisión oficial del proyecto (ADR-0008) — Upstash Redis, un
 * único connection string ("rediss://default:<password>@<host>:<port>",
 * TLS incluido en el esquema). Requerido: Redis/BullMQ ya son infraestructura
 * real del proyecto, no una pieza opcional.
 *
 * GOOGLE_MAPS_API_KEY: adapters de routing/geocoding (ADR-0010) — opcional
 * por ahora, igual que REDIS_URL antes de que Upstash quedara decidido. El
 * fundador todavía no la ha provisionado; los endpoints de `/navigation`
 * fallan con un error claro (503) si se llaman sin ella configurada, en vez
 * de tumbar el arranque de todo el backend. Se sube a requerida cuando esté
 * configurada en producción.
 *
 * VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT: Web Push (ADR-0033)
 * — opcional por el mismo motivo que GOOGLE_MAPS_API_KEY: el fundador aún
 * no las ha generado. `WebPushService` queda en no-op (con warning al
 * arrancar) hasta que las tres estén configuradas. Se generan corriendo
 * `bunx web-push generate-vapid-keys` — la llave privada nunca debe pasar
 * por chat ni quedar en git, solo en `backend/.env` real.
 *
 * GEMINI_API_KEY / GEMINI_LIVE_MODEL: Asistente de voz, primer slice real
 * de la integración Live (ADR-0034 — reemplaza la elección de OpenAI
 * Realtime de ADR-0016 por Gemini Live API, decisión explícita del
 * fundador). Opcional por el mismo motivo que las demás keys de proveedor:
 * sin `GEMINI_API_KEY`, `GeminiLiveService` queda en no-op (warning al
 * arrancar), el resto del backend sigue normal. `GEMINI_LIVE_MODEL` tiene
 * default porque los nombres de modelo Live cambian con el tiempo — se
 * puede actualizar sin tocar código, solo la variable de entorno. El
 * default (`gemini-3.1-flash-live-preview`) es un nombre real, verificado
 * disponible para esta cuenta vía `ai.models.list()` (filtrado por
 * `supportedActions.includes("bidiGenerateContent")`) — el nombre que trae
 * el ejemplo del SDK (`gemini-live-2.5-flash-preview`) no existe para esta
 * cuenta (cierre 1008 real, "is not found for API version v1beta").
 */
export interface EnvConfig {
  NODE_ENV: "development" | "production" | "test";
  PORT: number;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  REDIS_URL: string;
  GOOGLE_MAPS_API_KEY: string | undefined;
  VAPID_PUBLIC_KEY: string | undefined;
  VAPID_PRIVATE_KEY: string | undefined;
  VAPID_SUBJECT: string | undefined;
  GEMINI_API_KEY: string | undefined;
  GEMINI_LIVE_MODEL: string;
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
    GOOGLE_MAPS_API_KEY: (raw.GOOGLE_MAPS_API_KEY as string | undefined) || undefined,
    VAPID_PUBLIC_KEY: (raw.VAPID_PUBLIC_KEY as string | undefined) || undefined,
    VAPID_PRIVATE_KEY: (raw.VAPID_PRIVATE_KEY as string | undefined) || undefined,
    VAPID_SUBJECT: (raw.VAPID_SUBJECT as string | undefined) || undefined,
    GEMINI_API_KEY: (raw.GEMINI_API_KEY as string | undefined) || undefined,
    GEMINI_LIVE_MODEL: (raw.GEMINI_LIVE_MODEL as string | undefined) || "gemini-3.1-flash-live-preview",
  };
}
