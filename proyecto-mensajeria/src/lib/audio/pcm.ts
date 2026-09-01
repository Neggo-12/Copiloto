/**
 * Utilidades de audio PCM puras (sin React, sin estado) para el asistente de
 * voz (ADR-0034, segundo slice). Todo lo que necesita `useGeminiVoiceSession`
 * para convertir el micrófono real del navegador al formato que pide Gemini
 * Live (PCM 16-bit mono, base64, con `mimeType` incluyendo la tasa real) y
 * para reproducir de vuelta lo que Gemini manda (mismo formato, tasa real
 * distinta — 24kHz de salida vs. 16kHz de entrada, ver `gemini-live.service.ts`).
 *
 * Honesto: el downsampling de aquí es promediado simple (decimación), no un
 * resample con filtro anti-aliasing real — suficiente para verificar el
 * flujo completo con voz real por primera vez, pero si la calidad de audio
 * sale mala en la prueba real, esto es lo primero a mejorar (no antes, sin
 * evidencia de que haga falta — regla del proyecto de "no complejidad sin
 * evidencia").
 */

/** Tasa de muestreo que exige Gemini Live para audio de ENTRADA (micrófono) — ver `sendAudioChunk` en `gemini-live.service.ts`. */
export const GEMINI_INPUT_SAMPLE_RATE = 16000;

/** Convierte Float32 [-1, 1] (lo que da la Web Audio API) a Int16 PCM (lo que espera Gemini). Fórmula estándar, no inventada. */
export function floatTo16BitPCM(float32: Float32Array): Int16Array {
  const int16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const clamped = Math.max(-1, Math.min(1, float32[i] ?? 0));
    int16[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
  }
  return int16;
}

/**
 * Int16 PCM → Float32 [-1, 1] — inverso de `floatTo16BitPCM`, para
 * reproducir lo que llega de Gemini. Tipo de retorno explícito
 * `Float32Array<ArrayBuffer>` (no el genérico `Float32Array` a secas, que
 * TypeScript 5.7+ ensancha a `ArrayBufferLike`/`SharedArrayBuffer`
 * incluido): `AudioBuffer.copyToChannel` exige específicamente la variante
 * respaldada por `ArrayBuffer` real — error real de `tsc`, no un capricho.
 */
export function int16ToFloat32(int16: Int16Array): Float32Array<ArrayBuffer> {
  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) {
    float32[i] = (int16[i] ?? 0) / 0x8000;
  }
  return float32;
}

/**
 * Reduce la tasa de muestreo por decimación con promedio (no interpolación
 * real) — agrupa N muestras de entrada en 1 de salida, N = tasa
 * entrada/salida. Suficiente para voz (la energía de la voz humana cae
 * mayormente bajo 8kHz), pero no es un resample "correcto" con filtro
 * anti-aliasing. Si `inputSampleRate` ya es la deseada, no hace nada.
 */
export function downsampleTo(
  float32: Float32Array,
  inputSampleRate: number,
  targetSampleRate: number,
): Float32Array {
  if (inputSampleRate === targetSampleRate) return float32;
  if (inputSampleRate < targetSampleRate) {
    throw new Error(
      `downsampleTo: la tasa de entrada (${inputSampleRate}) es menor que la deseada (${targetSampleRate}) — esto es un downsampler, no un upsampler.`,
    );
  }
  const ratio = inputSampleRate / targetSampleRate;
  const newLength = Math.round(float32.length / ratio);
  const result = new Float32Array(newLength);
  let offsetSource = 0;
  for (let offsetResult = 0; offsetResult < newLength; offsetResult++) {
    const nextOffsetSource = Math.round((offsetResult + 1) * ratio);
    let accum = 0;
    let count = 0;
    for (let i = offsetSource; i < nextOffsetSource && i < float32.length; i++) {
      accum += float32[i] ?? 0;
      count++;
    }
    result[offsetResult] = count > 0 ? accum / count : 0;
    offsetSource = nextOffsetSource;
  }
  return result;
}

/** ArrayBuffer/TypedArray → base64. Trocea la conversión (`String.fromCharCode(...bytes)` truena con arrays grandes por límite de argumentos del engine). */
export function arrayBufferToBase64(buffer: ArrayBufferLike): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

/** base64 → Int16Array. Inverso de mandar `floatTo16BitPCM(...).buffer` por `arrayBufferToBase64`. */
export function base64ToInt16Array(base64: string): Int16Array {
  const binary = atob(base64);
  // PCM 16-bit real siempre debería venir en pares de bytes — se trunca el
  // último byte suelto por seguridad (defensivo: `Int16Array` truena con
  // `RangeError` si el buffer no es múltiplo de 2, y perder 1 byte de un
  // chunk de audio real es inaudible frente a cortar la reproducción
  // entera).
  const evenLength = binary.length - (binary.length % 2);
  const bytes = new Uint8Array(evenLength);
  for (let i = 0; i < evenLength; i++) bytes[i] = binary.charCodeAt(i);
  // Copia a un buffer alineado propio — `bytes.buffer` puede no estar
  // alineado a 2 bytes según cómo lo dé `atob`, y `Int16Array` lo exige.
  const aligned = new Uint8Array(bytes.length);
  aligned.set(bytes);
  return new Int16Array(aligned.buffer);
}

/** Extrae la tasa real de un `mimeType` tipo `"audio/pcm;rate=24000"` (formato real verificado contra la respuesta del servidor, ver ADR-0034). `fallback` si no trae `rate=`. */
export function parseSampleRateFromMimeType(mimeType: string, fallback = 24000): number {
  const match = /rate=(\d+)/.exec(mimeType);
  return match ? Number(match[1]) : fallback;
}
