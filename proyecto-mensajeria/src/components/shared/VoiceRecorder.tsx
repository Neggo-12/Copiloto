import { Mic, Send, Trash2 } from "@/components/shared/icons";
import { useRef, useState } from "react";
import { formatDuration } from "@/lib/format";

/**
 * Grabador reutilizable de nota de voz (mantener-para-grabar con onda animada).
 * Misma interacción que el compositor de Chats; la grabación real llegará con
 * Capacitor, aquí se simula la captura de amplitudes.
 */
export function VoiceRecorder({
  onRecorded,
  label = "Mantener presionado para grabar nota de voz",
}: {
  onRecorded: (durationSeconds: number, waveform: number[]) => void;
  label?: string;
}) {
  const [recordingSeconds, setRecordingSeconds] = useState<number | null>(null);
  const waveRef = useRef<number[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const isRecording = recordingSeconds !== null;

  const startRecording = () => {
    waveRef.current = [];
    setRecordingSeconds(0);
    timer.current = setInterval(() => {
      waveRef.current = [...waveRef.current, 0.25 + Math.random() * 0.75].slice(-28);
      setRecordingSeconds((prev) => (prev ?? 0) + 0.2);
    }, 200);
  };

  const stopRecording = (keep: boolean) => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    const seconds = recordingSeconds ?? 0;
    const waveform = waveRef.current;
    setRecordingSeconds(null);
    if (keep && seconds >= 1) onRecorded(Math.round(seconds), waveform);
  };

  if (isRecording) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-border bg-secondary px-3 py-2">
        <button
          type="button"
          aria-label="Cancelar grabación"
          onClick={() => stopRecording(false)}
          className="press touch-target grid place-items-center rounded-full text-destructive"
        >
          <Trash2 className="size-5" />
        </button>
        <div className="flex h-9 min-w-0 flex-1 items-center gap-[2px] overflow-hidden">
          {waveRef.current.map((value, index) => (
            <span
              key={index}
              style={{ height: `${value * 100}%` }}
              className="w-[3px] shrink-0 animate-pulse rounded-full bg-accent-warm"
            />
          ))}
        </div>
        <span className="font-mono text-[13px] text-muted-foreground">
          {formatDuration(recordingSeconds ?? 0)}
        </span>
        <button
          type="button"
          aria-label="Guardar nota de voz"
          onPointerUp={() => stopRecording(true)}
          onClick={() => stopRecording(true)}
          className="pulse-warm press grid size-11 shrink-0 place-items-center rounded-full bg-accent-warm text-accent-warm-foreground"
        >
          <Send className="size-5" />
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      aria-label={label}
      onPointerDown={startRecording}
      className="press touch-target flex w-full items-center justify-center gap-2 rounded-2xl border border-accent-warm/40 bg-accent-warm/10 py-3 text-[15px] font-medium text-accent-warm-foreground dark:text-accent-warm"
    >
      <Mic className="size-5" />
      Grabar nota de voz
    </button>
  );
}
