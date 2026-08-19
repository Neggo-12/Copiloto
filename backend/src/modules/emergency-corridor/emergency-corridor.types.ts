/**
 * Solo un estado en este primer slice: cualquier candidato dentro del
 * buffer del corredor se reporta como `potential_conflict`. `NO_CONFLICT`
 * es implícito (un usuario que no aparece en la lista). `ACTIVE_CONFLICT` y
 * `PASSED` (de la visión completa del fundador) quedan para una siguiente
 * rebanada — necesitan contexto que todavía no existe (velocidad relativa,
 * si el candidato ya cedió el paso, historial de trayectoria).
 */
export type CorridorConflictState = "potential_conflict";

export interface CorridorCandidate {
  userId: string;
  distanceMeters: number;
  state: CorridorConflictState;
}
