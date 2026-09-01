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
 * Por qué se cerró un corredor. `expired` se agregó 2026-09-01 (ver
 * `AlertPolicyService.sweepExpired`/`CorridorExpirySweepProcessor`): antes
 * era implícito (el TTL de `RouteSessionService`, 4h, vencía en silencio,
 * sin avisar "ya pasó" a quien alcanzó a alertarse) — gap documentado en
 * ADR-0020 como límite honesto, diferido a propósito hasta tener evidencia
 * real de que hacía falta. Ahora un barrido periódico real (no en el camino
 * síncrono de ninguna petición) detecta la ruta vencida y cierra el
 * corredor con este motivo.
 */
export type CorridorCloseReason = "completed" | "cancelled" | "expired";
