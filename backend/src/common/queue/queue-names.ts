/**
 * Registro central de colas del proyecto. Los dominios nunca deben escribir
 * el nombre de una cola como string suelto ni importar `bullmq` directo —
 * siempre a través de este archivo, para que agregar/renombrar una cola sea
 * un cambio en un solo lugar.
 *
 * - EMERGENCY_ALERTS: desde 2026-09-01 tiene su primer processor real
 *   (`CorridorExpirySweepProcessor`, barrido periódico de corredores que
 *   expiraron sin cierre explícito — ver ADR-0020). El cooldown/dedup de
 *   alertas (ADR-0013) sigue viviendo en Redis directo (`SET NX EX`), no en
 *   esta cola — no hace falta un job para eso.
 * - LOCATION_REMINDERS: trigger de recordatorios por geofence (Fase 7).
 */
export const QUEUE_NAMES = {
  SYSTEM: "system",
  EMERGENCY_ALERTS: "emergency-alerts",
  LOCATION_REMINDERS: "location-reminders",
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

/** Job de humo: no es lógica de negocio, solo prueba que Redis+BullMQ+worker responden de punta a punta. */
export const SYSTEM_JOB_NAMES = {
  PING: "ping",
} as const;

export interface SystemPingJobData {
  requestedAt: string;
  note?: string;
}

export interface SystemPingJobResult {
  pong: true;
  respondedAt: string;
}

/** Jobs de la cola `EMERGENCY_ALERTS` — barrido periódico de corredores expirados (ver `AlertPolicyService.sweepExpired`). */
export const EMERGENCY_ALERTS_JOB_NAMES = {
  CORRIDOR_EXPIRY_SWEEP: "corridor-expiry-sweep",
} as const;

/** Sin payload real — el barrido revisa TODOS los corredores activos, no uno en particular. */
export type CorridorExpirySweepJobData = Record<string, never>;

export interface CorridorExpirySweepJobResult {
  expiredCount: number;
}

/** Jobs de la cola `LOCATION_REMINDERS` — recordatorios de nota a hora fija (ADR-0030). */
export const LOCATION_REMINDER_JOB_NAMES = {
  NOTE_DUE: "note-due",
} as const;

export interface NoteReminderJobData {
  userId: string;
  reminderId: string;
}

export interface NoteReminderJobResult {
  /** `false` cuando el recordatorio ya no estaba `pending` al disparar (cancelado/completado entre encolar y disparar) — no se notificó nada. */
  delivered: boolean;
}
