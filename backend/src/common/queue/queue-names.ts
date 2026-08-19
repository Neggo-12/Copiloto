/**
 * Registro central de colas del proyecto. Los dominios nunca deben escribir
 * el nombre de una cola como string suelto ni importar `bullmq` directo —
 * siempre a través de este archivo, para que agregar/renombrar una cola sea
 * un cambio en un solo lugar.
 *
 * Reservadas pero SIN processor todavía (a propósito, regla de "no
 * complejidad sin evidencia"): quedan como interfaz lista para cuando se
 * construyan sus dominios reales, sin tener que rediseñar el registro.
 * - EMERGENCY_ALERTS: cooldown/expiración/escalado de alertas del Emergency
 *   Corridor (Fase 3, mobility-emergency.md — "nunca mandar un push nuevo
 *   por cada actualización de posición; deduplicar con cooldown").
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
