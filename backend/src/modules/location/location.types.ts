/**
 * Contratos del Location Engine. Todo lo que entra o sale del motor pasa por
 * estos tipos — la normalización/validación vive en un solo lugar
 * (location-normalizer.ts), nunca repetida en cada consumidor.
 */

/** Reporte crudo tal como lo manda el cliente (GPS del dispositivo). */
export interface RawLocationReport {
  latitude: number;
  longitude: number;
  accuracy: number;
  speed: number | null;
  heading: number | null;
  /** epoch ms, generado por el dispositivo (no confiar ciegamente: se contrasta contra la hora del servidor). */
  clientTimestamp: number;
}

export type LocationQuality = "good" | "low_accuracy" | "stale_clock";

/** Reporte ya normalizado/validado, lo único que el resto del sistema debe consumir. */
export interface NormalizedLocation {
  userId: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  speed: number | null;
  heading: number | null;
  clientTimestamp: number;
  serverTimestamp: number;
  quality: LocationQuality;
}

export type LocationRejectionReason =
  | "invalid_coordinates"
  | "invalid_accuracy"
  | "invalid_speed"
  | "clock_too_far_in_future"
  | "out_of_order"
  | "implausible_jump";

export interface LocationValidationResult {
  ok: boolean;
  rejectionReason?: LocationRejectionReason;
  quality: LocationQuality;
}

/** Estado de "última posición conocida" de un usuario, para detectar saltos y pérdida de señal. */
export interface LocationState {
  location: NormalizedLocation;
  /** true si no ha llegado un reporte nuevo dentro de la ventana de frescura configurada. */
  stale: boolean;
}
