import { Pause, Play, Spinner } from "@/components/shared/icons";
import { useEffect, useRef, useState } from "react";
import { formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase/client";

const FALLBACK_WAVE = [0.3, 0.6, 0.9, 0.5, 0.7, 0.4, 0.8, 0.55, 0.35, 0.75, 0.5, 0.65];
/** Vencimiento de la URL firmada — se resuelve de nuevo si expira y se vuelve a tocar. */
const SIGNED_URL_TTL_SECONDS = 3600;

/**
 * Reproductor REAL de nota de voz — un `<audio>` de verdad, no una barra de
 * progreso simulada. `sourceUrl` puede ser:
 * - una URL directa (`blob:`/`http`) — la burbuja optimista recién grabada.
 * - la RUTA de Storage del bucket privado `voice-notes` (mensajes ya
 *   guardados) — se resuelve a una URL firmada bajo demanda, no al cargar el
 *   chat completo. Ver ADR-0024.
 */
export function VoiceNotePlayer({
  durationSeconds,
  waveform,
  outgoing,
  sourceUrl,
}: {
  durationSeconds: number;
  waveform?: number[] | undefined;
  outgoing: boolean;
  sourceUrl: string | null;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [isPlaying, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const bars = waveform && waveform.length > 0 ? waveform : FALLBACK_WAVE;

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
    };
  }, []);

  async function resolveUrl(): Promise<string | null> {
    if (!sourceUrl) return null;
    if (sourceUrl.startsWith("blob:") || sourceUrl.startsWith("http")) return sourceUrl;
    const { data, error } = await supabase.storage
      .from("voice-notes")
      .createSignedUrl(sourceUrl, SIGNED_URL_TTL_SECONDS);
    if (error || !data) return null;
    return data.signedUrl;
  }

  async function togglePlay() {
    if (isPlaying) {
      audioRef.current?.pause();
      setPlaying(false);
      return;
    }
    setLoadError(null);
    let url = resolvedUrl;
    if (!url) {
      setResolving(true);
      url = await resolveUrl();
      setResolving(false);
      if (!url) {
        setLoadError("No se pudo cargar la nota de voz.");
        return;
      }
      setResolvedUrl(url);
    }
    if (!audioRef.current) audioRef.current = new Audio();
    audioRef.current.src = url;
    audioRef.current.onended = () => {
      setPlaying(false);
      setElapsed(0);
    };
    audioRef.current.ontimeupdate = () => {
      setElapsed(audioRef.current?.currentTime ?? 0);
    };
    audioRef.current.onerror = () => {
      setLoadError("No se pudo reproducir la nota de voz.");
      setPlaying(false);
    };
    try {
      await audioRef.current.play();
      setPlaying(true);
    } catch {
      setLoadError("No se pudo reproducir la nota de voz.");
    }
  }

  const progress = durationSeconds ? Math.min(1, elapsed / durationSeconds) : 0;

  return (
    <div className="flex w-56 items-center gap-3">
      <button
        type="button"
        onClick={() => void togglePlay()}
        disabled={resolving}
        aria-label={isPlaying ? "Pausar nota de voz" : "Reproducir nota de voz"}
        className={cn(
          "press grid size-9 shrink-0 place-items-center rounded-full",
          outgoing ? "bg-bubble-out-foreground/12" : "bg-secondary",
        )}
      >
        {resolving ? (
          <Spinner className="size-4 animate-spin" />
        ) : isPlaying ? (
          <Pause className="size-4" />
        ) : (
          <Play className="size-4" />
        )}
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
        {loadError && <p className="mt-0.5 text-[11px] text-destructive">{loadError}</p>}
      </div>
    </div>
  );
}
