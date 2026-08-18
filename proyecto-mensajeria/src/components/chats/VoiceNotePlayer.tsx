import { Pause, Play } from "@/components/shared/icons";
import { useEffect, useRef, useState } from "react";
import { formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";

const FALLBACK_WAVE = [0.3, 0.6, 0.9, 0.5, 0.7, 0.4, 0.8, 0.55, 0.35, 0.75, 0.5, 0.65];

/** Reproductor simulado de nota de voz con barra de progreso y onda. */
export function VoiceNotePlayer({
  durationSeconds,
  waveform,
  outgoing,
}: {
  durationSeconds: number;
  waveform?: number[] | undefined;
  outgoing: boolean;
}) {
  const [isPlaying, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const bars = waveform && waveform.length > 0 ? waveform : FALLBACK_WAVE;

  useEffect(() => {
    if (!isPlaying) {
      if (timer.current) clearInterval(timer.current);
      return;
    }
    timer.current = setInterval(() => {
      setElapsed((prev) => {
        if (prev + 0.2 >= durationSeconds) {
          setPlaying(false);
          return 0;
        }
        return prev + 0.2;
      });
    }, 200);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [isPlaying, durationSeconds]);

  const progress = durationSeconds ? elapsed / durationSeconds : 0;

  return (
    <div className="flex w-56 items-center gap-3">
      <button
        type="button"
        onClick={() => setPlaying((prev) => !prev)}
        aria-label={isPlaying ? "Pausar nota de voz" : "Reproducir nota de voz"}
        className={cn(
          "press grid size-9 shrink-0 place-items-center rounded-full",
          outgoing ? "bg-bubble-out-foreground/12" : "bg-secondary",
        )}
      >
        {isPlaying ? <Pause className="size-4" /> : <Play className="size-4" />}
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex h-7 items-center gap-[2px]">
          {bars.map((value, index) => {
            const active = index / bars.length <= progress;
            return (
              <span
                key={index}
                style={{ height: `${Math.max(0.18, value) * 100}%` }}
                className={cn(
                  "w-[3px] rounded-full transition-opacity",
                  active ? "opacity-100" : "opacity-35",
                  outgoing ? "bg-bubble-out-foreground" : "bg-primary",
                )}
              />
            );
          })}
        </div>
        <div className="mt-1 flex items-center justify-between">
          <span className="h-[3px] w-full max-w-[70%] overflow-hidden rounded-full bg-current/20">
            <span
              className="block h-full rounded-full bg-current"
              style={{ width: `${progress * 100}%` }}
            />
          </span>
          <span className="font-mono text-[11px] opacity-70">
            {formatDuration(isPlaying ? elapsed : durationSeconds)}
          </span>
        </div>
      </div>
    </div>
  );
}
