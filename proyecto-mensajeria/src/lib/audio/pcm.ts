/**
 * Utilidades de audio PCM puras (sin React, sin estado) para el asistente de
 * voz (ADR-0034, segundo slice). Todo lo que necesita `useGeminiVoiceSession`
 * para convertir el micrófono real del navegador al formato que pide Gemini
 * Live (PCM 16-bit mono, base64, con `mimeType` incluyendo la tasa real) y
 * para reproducir de vuelta lo que Gemini manda (mismo formato, tasa real
 * distinta — 24kHz de salida vs. 16kHz de entrada, ver `gemini-live.service.ts`).
 *
 * Actualizado 2026-09-01 (Fase 6, pendiente que quedó anotado desde el
 * primer slice): `downsampleTo` ahora aplica un filtro pasa-bajos real
 * antes de decimar — ver `lowPassFilter` y la nota en `downsampleTo`.
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
 * Filtro pasa-bajos de un polo (RC/exponential moving average) — diseño
 * estándar, no inventado: `alpha = dt / (RC + dt)`, `RC = 1 / (2π·fc)`,
 * aplicado hacia adelante sample-por-sample (`y[n] = y[n-1] + alpha·(x[n] -
 * y[n-1])`). Se aplica DOS VECES en cascada en `downsampleTo` (12 dB/octava
 * en vez de 6 dB/octava de un solo polo) — suficiente para atenuar el
 * contenido por encima de la nueva Nyquist antes de decimar, sin pagar el
 * costo de una convolución FIR completa en el hilo de audio del navegador
 * (`ScriptProcessorNode.onaudioprocess` corre en tiempo real, no puede
 * bloquear).
 */
function onePoleLowPass(
  float32: Float32Array,
  sampleRate: number,
  cutoffHz: number,
): Float32Array {
  const rc = 1 / (2 * Math.PI * cutoffHz);
  const dt = 1 / sampleRate;
  const alpha = dt / (rc + dt);
  const result = new Float32Array(float32.length);
  let prev = float32[0] ?? 0;
  for (let i = 0; i < float32.length; i++) {
    const sample = float32[i] ?? 0;
    prev = prev + alpha * (sample - prev);
    result[i] = prev;
  }
  return result;
}

/**
 * Reduce la tasa de muestreo: filtra pasa-bajos real (anti-aliasing, ver
 * `onePoleLowPass`) y LUEGO decima agrupando N muestras filtradas en 1 de
 * salida por promedio, N = tasa entrada/salida. Antes de este cambio se
 * decimaba directo sin filtrar — cualquier frecuencia de entrada por
 * encima de la nueva Nyquist (targetSampleRate/2) se pliega hacia abajo
 * como ruido audible real (aliasing), en vez de perderse limpio. El corte
 * del filtro se pone un poco por debajo de la Nyquist exacta
 * (`0.45 · targetSampleRate` en vez de `0.5 ·`) para dejar margen de
 * transición real a un filtro de orden bajo, no ideal. Si `inputSampleRate`
 * ya es la deseada, no hace nada (ni filtra).
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
  const cutoffHz = targetSampleRate * 0.45;
  const filtered = onePoleLowPass(
    onePoleLowPass(float32, inputSampleRate, cutoffHz),
    inputSampleRate,
    cutoffHz,
  );

  const ratio = inputSampleRate / targetSampleRate;
  const newLength = Math.round(filtered.length / ratio);
  const result = new Float32Array(newLength);
  let offsetSource = 0;
  for (let offsetResult = 0; offsetResult < newLength; offsetResult++) {
    const nextOffsetSource = Math.round((offsetResult + 1) * ratio);
    let accum = 0;
    let count = 0;
    for (
      let i = offsetSource;
      i < nextOffsetSource && i < filtered.length;
      i++
    ) {
      accum += filtered[i] ?? 0;
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
export function parseSampleRateFromMimeType(
  mimeType: string,
  fallback = 24000,
): number {
  const match = /rate=(\d+)/.exec(mimeType);
  return match ? Number(match[1]) : fallback;
}
