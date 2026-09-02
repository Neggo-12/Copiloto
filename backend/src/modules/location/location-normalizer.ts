import { haversineMeters } from "../../common/geo/haversine";
import type { LocationQuality, LocationValidationResult, NormalizedLocation, RawLocationReport } from "./location.types";

/**
 * Reglas de validación del Location Engine. Deliberadamente NO es "recibir
 * lat/lng cada N segundos y guardarlos" — valida rango, calidad de señal,
 * desfase de reloj, y saltos implausibles contra la última posición conocida
 * (regla explícita del proyecto: nada de arquitectura ingenua).
 */

const LOW_ACCURACY_METERS = 100;
const HARD_REJECT_ACCURACY_METERS = 5000;
const HARD_REJECT_SPEED_MPS = 83.3; // ~300 km/h — imposible en contexto vehicular real
const MAX_FUTURE_CLOCK_SKEW_MS = 30_000;
/** Velocidad implícita máxima entre dos puntos consecutivos antes de considerarlo un "teletransporte" (sensor con ruido/glitch). */
const MAX_IMPLIED_SPEED_MPS = 100; // ~360 km/h

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function validateRawReport(raw: RawLocationReport, serverNow: number, previous: NormalizedLocation | null): LocationValidationResult {
  if (
    !isFiniteNumber(raw.latitude) ||
    !isFiniteNumber(raw.longitude) ||
    raw.latitude < -90 ||
    raw.latitude > 90 ||
    raw.longitude < -180 ||
    raw.longitude > 180
  ) {
    return { ok: false, rejectionReason: "invalid_coordinates", quality: "good" };
  }

  if (!isFiniteNumber(raw.accuracy) || raw.accuracy < 0 || raw.accuracy > HARD_REJECT_ACCURACY_METERS) {
    return { ok: false, rejectionReason: "invalid_accuracy", quality: "good" };
  }

  if (raw.speed !== null && (!isFiniteNumber(raw.speed) || raw.speed < 0 || raw.speed > HARD_REJECT_SPEED_MPS)) {
    return { ok: false, rejectionReason: "invalid_speed", quality: "good" };
  }

  if (!isFiniteNumber(raw.clientTimestamp) || raw.clientTimestamp - serverNow > MAX_FUTURE_CLOCK_SKEW_MS) {
    return { ok: false, rejectionReason: "clock_too_far_in_future", quality: "good" };
  }

  if (previous) {
    // Reporte "atrasado" (llegó tarde por red móvil poco confiable — reintento,
    // reordenamiento de paquetes, cola offline que se vacía al reconectar) con
    // un `clientTimestamp` igual o anterior al último reporte YA guardado.
    // Encontrado con evidencia real (Escenario 6 del simulador, "GPS
    // atrasado" — ver ADR-0022): antes esto cala por el cálculo de abajo
    // (`impliedSpeed`) con `deltaSeconds` forzado a un mínimo de 0.001s vía
    // `Math.max(...)`, así que CUALQUIER distancia no-cero entre las dos
    // posiciones producía una velocidad implícita absurda y el reporte
    // terminaba rechazado igual, pero con el motivo equivocado
    // ("implausible_jump", como si fuera un salto físico imposible, no un
    // reporte fuera de orden). Aceptar este reporte estaría mal de todas
    // formas — haría retroceder en el tiempo la posición "actual" guardada —
    // así que se rechaza explícito, con el motivo real.
    if (raw.clientTimestamp <= previous.clientTimestamp) {
      return { ok: false, rejectionReason: "out_of_order", quality: "good" };
    }

    const deltaSeconds = (raw.clientTimestamp - previous.clientTimestamp) / 1000;
    const distanceMeters = haversineMeters(
      { latitude: previous.latitude, longitude: previous.longitude },
      { latitude: raw.latitude, longitude: raw.longitude },
    );
    const impliedSpeed = distanceMeters / deltaSeconds;
    if (impliedSpeed > MAX_IMPLIED_SPEED_MPS) {
      return { ok: false, rejectionReason: "implausible_jump", quality: "good" };
    }
  }

  const quality: LocationQuality = raw.accuracy > LOW_ACCURACY_METERS ? "low_accuracy" : "good";
  return { ok: true, quality };
}

export function normalizeReport(userId: string, raw: RawLocationReport, serverNow: number, quality: LocationQuality): NormalizedLocation {
  return {
    userId,
    latitude: raw.latitude,
    longitude: raw.longitude,
    accuracy: raw.accuracy,
    speed: raw.speed,
    heading: raw.heading,
    clientTimestamp: raw.clientTimestamp,
    serverTimestamp: serverNow,
    quality,
  };
}
