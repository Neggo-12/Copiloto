import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { BACKEND_BASE_URL, getBackendAccessToken } from "@/lib/backend/client";
import {
  GEMINI_INPUT_SAMPLE_RATE,
  arrayBufferToBase64,
  base64ToInt16Array,
  downsampleTo,
  floatTo16BitPCM,
  int16ToFloat32,
  parseSampleRateFromMimeType,
} from "@/lib/audio/pcm";

export type VoiceSessionStatus = "idle" | "connecting" | "listening" | "error" | "closed";

export interface GeminiVoiceController {
  status: VoiceSessionStatus;
  error: string | null;
  transcript: string;
  start: () => Promise<void>;
  stop: () => void;
}

/** 4096 muestras a ~48kHz ≈ 85ms por chunk de micrófono — cadencia razonable sin saturar el socket. */
const CAPTURE_BUFFER_SIZE = 4096;

/**
 * Segundo slice de ADR-0034: conecta el micrófono real del navegador a
 * `AssistantVoiceGateway` (`/assistant-voice`), con audio real en ambas
 * direcciones. Mismo patrón de auth/conexión que `useCopilotoRealtime`
 * (REUSE: `getBackendAccessToken()` + `io(namespace, {auth:{token}})`), pero
 * a diferencia de esa (conecta sola al montar), esta espera una acción
 * explícita del usuario (`start()`) — abre micrófono real y una sesión real
 * de Gemini, no algo para disparar solo al entrar a la pantalla.
 *
 * Captura: `ScriptProcessorNode` (API deprecada pero soportada en todos los
 * navegadores reales; más simple que `AudioWorklet` para este primer slice
 * — sin evidencia todavía de que haga falta migrar, regla del proyecto de
 * "no complejidad sin evidencia"). Cada buffer se reduce a 16kHz/16-bit
 * (`lib/audio/pcm.ts`, decimación simple, no resample con anti-aliasing) y
 * se manda por `voice:audio-chunk`.
 *
 * Reproducción: cada chunk que llega de Gemini se decodifica y se agenda
 * con `AudioBufferSourceNode` encadenado (técnica estándar de streaming con
 * Web Audio API, sin huecos ni traslapes) — se agenda apenas llega, sin
 * cola/buffer propio.
 *
 * Verificado real con micrófono real (ver ADR-0034): el fundador habló y
 * escuchó la respuesta real de Gemini en voz. Esa misma prueba encontró un
 * bug real de concurrencia — `start()` sin guarda contra llamarse dos
 * veces sin cerrar la sesión anterior hacía que el mismo micrófono
 * mandara audio a VARIAS sesiones de Gemini a la vez, cada una
 * respondiendo por su lado ("varios agentes hablando a la vez") — corregido
 * con `cleanup()` defensivo al inicio de `start()` y `reconnection: false`
 * (ver comentarios abajo).
 */
export function useGeminiVoiceSession(): GeminiVoiceController {
  const [status, setStatus] = useState<VoiceSessionStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState("");

  const socketRef = useRef<Socket | null>(null);
  const captureCtxRef = useRef<AudioContext | null>(null);
  const playbackCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const nextPlaybackTimeRef = useRef(0);
  // Fuentes de audio agendadas/sonando de la respuesta actual — se necesita
  // esta lista para poder cortarlas YA ante un barge-in real (ver
  // `voice:interrupted` abajo). Antes no se guardaba ninguna referencia:
  // cada chunk se agendaba y se olvidaba, así que no había forma de
  // detener lo que ya estaba sonando cuando el usuario interrumpía — la
  // respuesta vieja seguía hablando encima de la nueva.
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);

  const cleanup = useCallback(() => {
    processorRef.current?.disconnect();
    processorRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    void captureCtxRef.current?.close();
    captureCtxRef.current = null;
    void playbackCtxRef.current?.close();
    playbackCtxRef.current = null;
    nextPlaybackTimeRef.current = 0;
    activeSourcesRef.current = [];
    socketRef.current?.disconnect();
    socketRef.current = null;
  }, []);

  /**
   * Corta YA cualquier audio de la respuesta anterior que siga sonando o
   * agendado — barge-in real. `.stop()` es válido tanto en una fuente que
   * ya está sonando como en una agendada a futuro que todavía no arrancó
   * (comportamiento estándar de `AudioBufferSourceNode`, no supuesto).
   */
  const stopPlayback = useCallback(() => {
    for (const source of activeSourcesRef.current) {
      try {
        source.stop();
      } catch {
        // Ya se había detenido sola (llegó a su fin natural entre que se
        // armó esta lista y que se llamó stop) — no es un error real.
      }
    }
    activeSourcesRef.current = [];
    const ctx = playbackCtxRef.current;
    if (ctx) nextPlaybackTimeRef.current = ctx.currentTime;
  }, []);

  const playChunk = useCallback((base64Data: string, mimeType: string) => {
    const ctx = playbackCtxRef.current;
    if (!ctx) return; // sesión ya cerrada — chunk tardío, se descarta.
    const sampleRate = parseSampleRateFromMimeType(mimeType);
    const int16 = base64ToInt16Array(base64Data);
    const float32 = int16ToFloat32(int16);

    // `AudioBuffer` real permite declarar su propia tasa
    // (`createBuffer(channels, length, sampleRate)`) distinta a la del
    // `AudioContext` — el motor la resamplea al reproducir. Comportamiento
    // estándar documentado de la Web Audio API, no un supuesto.
    const buffer = ctx.createBuffer(1, float32.length, sampleRate);
    buffer.copyToChannel(float32, 0);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    // Se registra ANTES de `.start()` para que `stopPlayback()` la pueda
    // cortar aunque la interrupción llegue mientras esta fuente todavía
    // está agendada a futuro, no sonando todavía.
    activeSourcesRef.current.push(source);
    source.onended = () => {
      activeSourcesRef.current = activeSourcesRef.current.filter((s) => s !== source);
    };
    const startAt = Math.max(ctx.currentTime, nextPlaybackTimeRef.current);
    source.start(startAt);
    nextPlaybackTimeRef.current = startAt + buffer.duration;
  }, []);

  const start = useCallback(async () => {
    // Bug real encontrado probando con micrófono real: `start()` no tenía
    // guarda contra llamarse dos veces sin haber cerrado la sesión
    // anterior (doble tap, reintentos tras error, reconexión automática de
    // socket.io reviviendo un socket viejo) — cada llamada abría un
    // `AudioContext`+socket+sesión de Gemini NUEVOS sin cerrar los
    // anteriores, así que el mismo micrófono real terminaba mandando audio
    // a VARIAS sesiones de Gemini a la vez, cada una respondiendo por su
    // lado — sonaba como "varios agentes hablando a la vez", que es
    // exactamente lo que pasó real. `cleanup()` defensivo aquí garantiza
    // como máximo una sesión viva, sin importar cuántas veces se llame
    // `start()`.
    cleanup();

    setError(null);
    setTranscript("");
    setStatus("connecting");

    const token = await getBackendAccessToken();
    if (!token) {
      setStatus("error");
      setError("No hay sesión activa.");
      return;
    }

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setStatus("error");
      setError("Este navegador no permite usar el micrófono.");
      return;
    }

    // Contextos de audio creados YA, dentro del mismo gesto del usuario
    // (el click que llamó a `start()`) — varios navegadores (Safari en
    // particular) bloquean reproducción de audio creada fuera de un gesto
    // real, así que no se crean después, de forma perezosa.
    const playbackCtx = new AudioContext();
    playbackCtxRef.current = playbackCtx;
    nextPlaybackTimeRef.current = playbackCtx.currentTime;
    void playbackCtx.resume();

    const socket = io(`${BACKEND_BASE_URL}/assistant-voice`, {
      auth: { token },
      transports: ["websocket"],
      // A propósito, sin reconexión automática: si el socket se cae, mejor
      // que la UI pase a "error" y el usuario decida tocar el micrófono de
      // nuevo (pasando por el `cleanup()` de arriba) que dejar que
      // socket.io reviva el socket solo en segundo plano — eso fue parte
      // real del bug de "varios agentes a la vez" (un socket viejo que se
      // reconectaba solo, sin que `start()` supiera que existía).
      reconnection: false,
    });
    socketRef.current = socket;

    socket.on("connect_error", (err: Error) => {
      setStatus("error");
      setError(err.message || "No se pudo conectar con el asistente de voz.");
      cleanup(); // sin esto, el AudioContext/mic quedaban abiertos aunque la conexión hubiera fallado.
    });

    socket.on("voice:error", (payload: { message?: string }) => {
      setStatus("error");
      setError(payload?.message ?? "Error del asistente de voz.");
      cleanup();
    });

    socket.on("disconnect", (reason: string) => {
      // Sin reconexión automática (ver arriba), cualquier desconexión
      // termina la sesión — más vale limpiar aquí que dejar recursos
      // abiertos esperando un `start()` futuro que quizás no llegue.
      if (reason !== "io client disconnect") {
        setStatus("error");
        setError("Se perdió la conexión con el asistente de voz.");
      }
      cleanup();
    });

    socket.on("voice:closed", () => {
      setStatus("closed");
      cleanup();
    });

    socket.on("voice:text", (payload: { text: string }) => {
      setTranscript((prev) => prev + payload.text);
    });

    socket.on("voice:audio-chunk", (payload: { data: string; mimeType: string }) => {
      playChunk(payload.data, payload.mimeType);
    });

    // Bug real corregido 2026-09-02: el asistente decía "ya te mostré la
    // ruta en Google Maps" sin haber abierto nada — `calculate_route`
    // (backend) es solo lectura. `open_navigation` sí abre Maps de verdad,
    // pero el resultado (la URL) solo puede convertirse en una pestaña
    // real desde el navegador — este es ese único punto. Se ignoran los
    // resultados de cualquier otra tool (ver comentario de
    // `onToolResult` en `gemini-live.service.ts` del backend: el evento
    // manda TODAS las tool calls, no solo esta).
    socket.on(
      "voice:tool-result",
      (payload: {
        name: string;
        outcome: { status: string; data?: unknown; message?: string };
      }) => {
        if (payload?.name !== "open_navigation" || payload.outcome?.status !== "ok") return;
        const mapsUrl = (payload.outcome.data as { mapsUrl?: string } | undefined)?.mapsUrl;
        if (mapsUrl) {
          window.open(mapsUrl, "_blank", "noopener,noreferrer");
        }
      },
    );

    // Barge-in real: Gemini mandó `serverContent.interrupted` porque el
    // usuario empezó a hablar mientras la respuesta anterior todavía se
    // estaba reproduciendo — cortar YA ese audio, no esperar a que termine
    // su frase (ver `GeminiLiveCallbacks.onInterrupted` en el backend).
    socket.on("voice:interrupted", () => {
      stopPlayback();
    });

    // Bug real ya encontrado y corregido en `AssistantVoiceGateway`: no
    // mandar nada hasta `voice:ready` — `connect` (transporte) dispara
    // antes de que el servidor termine de abrir la sesión de Gemini.
    socket.on("voice:ready", () => {
      void (async () => {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          streamRef.current = stream;

          const captureCtx = new AudioContext();
          captureCtxRef.current = captureCtx;
          void captureCtx.resume();
          const source = captureCtx.createMediaStreamSource(stream);
          // `createScriptProcessor` está deprecado a favor de
          // `AudioWorkletNode`, pero sigue soportado en todos los
          // navegadores reales y es mucho más simple para este primer
          // slice — sin evidencia todavía de que haga falta migrar.
          const processor = captureCtx.createScriptProcessor(CAPTURE_BUFFER_SIZE, 1, 1);
          processorRef.current = processor;

          processor.onaudioprocess = (event) => {
            if (!socketRef.current?.connected) return;
            const input = event.inputBuffer.getChannelData(0);
            const downsampled = downsampleTo(
              input,
              captureCtx.sampleRate,
              GEMINI_INPUT_SAMPLE_RATE,
            );
            const pcm16 = floatTo16BitPCM(downsampled);
            const base64Data = arrayBufferToBase64(pcm16.buffer);
            socketRef.current.emit("voice:audio-chunk", {
              data: base64Data,
              mimeType: `audio/pcm;rate=${GEMINI_INPUT_SAMPLE_RATE}`,
            });
          };

          // Necesario conectarlo al destino para que el navegador procese
          // el grafo (`onaudioprocess` no dispara si el nodo no llega a
          // `destination` en varios navegadores reales) — pero por un
          // `GainNode` en 0 para que el usuario NO se escuche a sí mismo.
          const silentGain = captureCtx.createGain();
          silentGain.gain.value = 0;
          source.connect(processor);
          processor.connect(silentGain);
          silentGain.connect(captureCtx.destination);

          setStatus("listening");
        } catch (err) {
          setStatus("error");
          setError(
            err instanceof Error && err.name === "NotAllowedError"
              ? "Necesitas darle permiso de micrófono a la app."
              : "No se pudo acceder al micrófono.",
          );
          cleanup();
        }
      })();
    });
  }, [cleanup, playChunk, stopPlayback]);

  const stop = useCallback(() => {
    socketRef.current?.emit("voice:audio-end");
    cleanup();
    setStatus("idle");
  }, [cleanup]);

  // Si el componente se desmonta con una sesión viva (el usuario navega a
  // otra pestaña principal, no solo cambia de sub-pestaña dentro de
  // Copiloto), no dejar el micrófono/socket/sesión de Gemini abiertos.
  useEffect(() => {
    return () => cleanup();
  }, [cleanup]);

  return { status, error, transcript, start, stop };
}
