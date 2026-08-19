import { useRef, useState } from "react";

const MAX_WAVEFORM_BARS = 28;
/** Formato de audio real que graba el navegador — el primero soportado gana. */
const PREFERRED_MIME_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return PREFERRED_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
}

export interface VoiceRecorderController {
  isRecording: boolean;
  recordingSeconds: number;
  waveform: number[];
  error: string | null;
  start: () => Promise<void>;
  /** `keep=false` descarta la grabación (cancelar). */
  stop: (
    keep: boolean,
    onRecorded: (durationSeconds: number, waveform: number[], blob: Blob) => void,
  ) => void;
}

/**
 * Grabación REAL de audio del micrófono (`getUserMedia`+`MediaRecorder`),
 * con onda calculada por RMS real de la señal (`AnalyserNode`), no por
 * `Math.random()`. Antes el composer de chats y la libreta de notas tenían
 * cada uno su propia versión decorativa (solo contaban segundos). Ver
 * ADR-0024 — este hook es la única implementación real, compartida.
 */
export function useVoiceRecorder(): VoiceRecorderController {
  const [recordingSeconds, setRecordingSeconds] = useState<number | null>(null);
  const [waveform, setWaveform] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mimeTypeRef = useRef<string | undefined>(undefined);
  const waveRef = useRef<number[]>([]);

  const sampleWaveform = () => {
    const analyser = analyserRef.current;
    if (!analyser) return;
    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteTimeDomainData(data);
    let sumSquares = 0;
    for (const value of data) {
      const normalized = (value - 128) / 128;
      sumSquares += normalized * normalized;
    }
    const rms = Math.sqrt(sumSquares / data.length);
    waveRef.current = [...waveRef.current, Math.min(1, rms * 4)].slice(-MAX_WAVEFORM_BARS);
    setWaveform(waveRef.current);
    rafRef.current = requestAnimationFrame(sampleWaveform);
  };

  const cleanup = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    void audioCtxRef.current?.close();
    audioCtxRef.current = null;
    analyserRef.current = null;
  };

  const start = async () => {
    setError(null);
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("Este navegador no permite grabar audio.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const AudioContextCtor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioContextCtor) {
        const audioCtx = new AudioContextCtor();
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        audioCtxRef.current = audioCtx;
        analyserRef.current = analyser;
      }

      const mimeType = pickMimeType();
      mimeTypeRef.current = mimeType;
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorderRef.current = recorder;
      recorder.start();

      waveRef.current = [];
      setWaveform([]);
      setRecordingSeconds(0);
      timerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => (prev ?? 0) + 0.2);
      }, 200);
      rafRef.current = requestAnimationFrame(sampleWaveform);
    } catch (err) {
      setError(
        err instanceof Error && err.name === "NotAllowedError"
          ? "Necesitas darle permiso de micrófono a la app."
          : "No se pudo acceder al micrófono.",
      );
      cleanup();
    }
  };

  const stop = (
    keep: boolean,
    onRecorded: (durationSeconds: number, waveform: number[], blob: Blob) => void,
  ) => {
    const seconds = recordingSeconds ?? 0;
    const finalWaveform = waveRef.current;
    const recorder = recorderRef.current;
    setRecordingSeconds(null);

    if (!recorder) {
      cleanup();
      return;
    }
    if (!keep || seconds < 1) {
      recorder.stop();
      cleanup();
      return;
    }
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current ?? "audio/webm" });
      cleanup();
      onRecorded(Math.round(seconds), finalWaveform, blob);
    };
    recorder.stop();
  };

  return {
    isRecording: recordingSeconds !== null,
    recordingSeconds: recordingSeconds ?? 0,
    waveform,
    error,
    start,
    stop,
  };
}
