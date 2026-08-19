/**
 * Contrato del Tool Registry (Fase 6, primer slice). Sigue el pipeline ya
 * documentado en el skill del proyecto:
 *
 *   Voice → Realtime/STT → Tool Call → Authorization/Confirmation →
 *   Application Service → Domain → Result → Voice
 *
 * Este módulo cubre "Tool Call → Authorization/Confirmation → Application
 * Service → Domain → Result" — la mitad que ya se puede construir y
 * verificar real hoy, sin depender de que el fundador provisione todavía
 * una cuenta/API key de Realtime. La IA nunca toca Postgres/Redis
 * directo: cada tool llama a un servicio de aplicación que ya existe
 * (`LocationRemindersService`, `RoutingProvider`, etc.), nunca al cliente
 * de Supabase/ioredis directamente.
 */

/** JSON Schema mínimo — el mismo formato que espera la config de "tools" de OpenAI Realtime/function-calling. No se valida contra una librería (ajv/zod) a propósito: cada tool valida sus propios argumentos a mano, mismo estilo ya usado en los controllers del proyecto. */
export interface ToolParameterSchema {
  type: "object";
  properties: Record<string, { type: string; description: string; enum?: string[] }>;
  required: string[];
}

export interface ToolExecutionContext {
  userId: string;
  /** true si el usuario ya confirmó explícitamente (segunda llamada, después de un `needs_confirmation`). */
  confirmed?: boolean;
}

export type ToolOutcome =
  | { status: "ok"; data: unknown }
  /** El usuario está autenticado pero no autorizado para esta acción específica (ej. no es ambulancia verificada). */
  | { status: "denied"; reason: string }
  /** La tool requiere confirmación explícita antes de ejecutar el efecto real — el asistente debe preguntarle al usuario y volver a llamar con `confirmed: true`. */
  | { status: "needs_confirmation"; summary: string }
  /** Fallo esperable de negocio (dirección no encontrada, datos faltantes) — no es un error de servidor, es algo que el asistente debe poder decir en voz alta de forma natural. */
  | { status: "error"; message: string };

export interface AssistantTool {
  name: string;
  description: string;
  parameters: ToolParameterSchema;
  /** Si es true, la primera llamada sin `confirmed: true` devuelve `needs_confirmation` en vez de ejecutar el efecto real. */
  requiresConfirmation: boolean;
  execute(ctx: ToolExecutionContext, args: Record<string, unknown>): Promise<ToolOutcome>;
}
