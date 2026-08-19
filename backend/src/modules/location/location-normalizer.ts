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

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
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
    const deltaSeconds = Math.max((raw.clientTimestamp - previous.clientTimestamp) / 1000, 0.001);
    const distanceMeters = haversineMeters(previous.latitude, previous.longitude, raw.latitude, raw.longitude);
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
