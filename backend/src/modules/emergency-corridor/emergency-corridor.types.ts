/**
 * Solo un estado en este primer slice: cualquier candidato dentro del
 * buffer del corredor se reporta como `potential_conflict`. `NO_CONFLICT`
 * es implícito (un usuario que no aparece en la lista). `ACTIVE_CONFLICT` y
 * `PASSED` (de la visión completa del fundador) quedan para una siguiente
 * rebanada — necesitan contexto que todavía no existe (velocidad relativa,
 * si el candidato ya cedió el paso, historial de trayectoria).
 */
export type CorridorConflictState = "potential_conflict";

/**
 * Qué tan urgente es el aviso para ESTE candidato — relativo al buffer
 * dinámico del momento (ver `dynamicBufferMeters` en
 * `emergency-corridor.service.ts`), no a un valor fijo de metros: un
 * candidato a 100m es `critical` si la ambulancia va rápido y el buffer es
 * de 400m, pero solo `warning` si el buffer es de 150m. Umbrales (25%/60%
 * del buffer) son una primera decisión razonada, no un dato que el fundador
 * dio — documentado en ADR-0021, ajustable con evidencia real de uso.
 */
export type CorridorSeverity = "info" | "warning" | "critical";

export interface CorridorCandidate {
  userId: string;
  distanceMeters: number;
  state: CorridorConflictState;
  severity: CorridorSeverity;
}

/**
 * Por qué se cerró un corredor. `expired` no pasa por aquí — es implícito:
 * el TTL de `RouteSessionService` (4h) y el TTL espejo del set de alertados
 * en `AlertPolicyService` simplemente vencen solos si nadie cierra a mano.
 * Documentado como límite honesto de este slice (ver ADR de cierre): no hay
 * todavía un job que notifique "conflicto resuelto" cuando expira sin
 * cierre explícito.
 */
export type CorridorCloseReason = "completed" | "cancelled";
