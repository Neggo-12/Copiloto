import {
  Camera,
  FileText,
  ImageIcon,
  MapPin,
  Mic,
  NavigationArrow,
  Paperclip,
  Send,
  Trash2,
  X,
} from "@/components/shared/icons";
import { useEffect, useRef, useState } from "react";
import { LIVE_LOCATION_OPTIONS, previewForMessage } from "@/lib/actions/chats";
import type { LiveLocationDuration } from "@/lib/actions/chats";
import { formatDuration } from "@/lib/format";
import type { Message } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

export interface ComposerHandlers {
  onSendText: (body: string) => void;
  onSendVoiceNote: (durationSeconds: number, waveform: number[]) => void;
  onSendAttachment: (kind: "image" | "document", fileName: string, size?: number) => void;
  /** Comparte la ubicación actual (simulada). */
  onShareCurrentLocation: () => void;
  /** Inicia la ubicación en tiempo real con la duración elegida (simulada). */
  onStartLiveLocation: (duration: LiveLocationDuration) => void;
}

/** Campo inferior: texto/enviar, mantener para grabar y adjuntos. */
export function MessageComposer({
  handlers,
  replyTo,
  onCancelReply,
  editing,
  onCancelEdit,
  onConfirmEdit,
}: {
  handlers: ComposerHandlers;
  replyTo: Message | null;
  onCancelReply: () => void;
  editing: Message | null;
  onCancelEdit: () => void;
  onConfirmEdit: (body: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const [isAttachOpen, setAttachOpen] = useState(false);
  /** Paso del submenú de ubicación: null (oculto), opciones o duración en vivo. */
  const [locationStep, setLocationStep] = useState<"options" | "duration" | null>(null);
  const closeAttach = () => {
    setLocationStep(null);
    setAttachOpen(false);
  };
  const [recordingSeconds, setRecordingSeconds] = useState<number | null>(null);
  const waveRef = useRef<number[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setDraft(editing ? editing.body : "");
  }, [editing]);

  const hasText = draft.trim().length > 0;
  const isRecording = recordingSeconds !== null;

  const startRecording = () => {
    waveRef.current = [];
    setRecordingSeconds(0);
    timer.current = setInterval(() => {
      waveRef.current = [...waveRef.current, 0.25 + Math.random() * 0.75].slice(-28);
      setRecordingSeconds((prev) => (prev ?? 0) + 0.2);
    }, 200);
  };

  const stopRecording = (send: boolean) => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    const seconds = recordingSeconds ?? 0;
    const waveform = waveRef.current;
    setRecordingSeconds(null);
    if (send && seconds >= 1) handlers.onSendVoiceNote(Math.round(seconds), waveform);
  };

  const submitText = () => {
    if (!hasText) return;
    if (editing) {
      onConfirmEdit(draft);
    } else {
      handlers.onSendText(draft);
    }
    setDraft("");
  };

  return (
    <div className="safe-bottom shrink-0 border-t border-border/70 bg-surface/95 px-3 pt-2 backdrop-blur">
      {(replyTo || editing) && (
        <div className="mb-2 flex items-start gap-2 rounded-2xl border-l-2 border-primary bg-secondary px-3 py-2">
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-semibold text-primary">
              {editing ? "Editando mensaje" : "Respondiendo"}
            </p>
            <p className="truncate text-[13px] text-muted-foreground">
              {previewForMessage((editing ?? replyTo) as Message)}
            </p>
          </div>
          <button
            type="button"
            aria-label="Cancelar"
            onClick={editing ? onCancelEdit : onCancelReply}
            className="press grid size-7 place-items-center rounded-full text-muted-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      {isAttachOpen && locationStep === null && (
        <div className="mb-2 grid grid-cols-4 gap-2">
          {[
            { label: "Cámara", icon: Camera, run: () => handlers.onSendAttachment("image", "foto-camara.jpg") },
            { label: "Galería", icon: ImageIcon, run: () => handlers.onSendAttachment("image", "galeria-01.jpg") },
            {
              label: "Documento",
              icon: FileText,
              run: () => handlers.onSendAttachment("document", "documento.pdf", 312_000),
            },
            { label: "Ubicación", icon: MapPin, run: null },
          ].map(({ label, icon: Icon, run }) => (
            <button
              key={label}
              type="button"
              onClick={() => {
                if (run) {
                  run();
                  setAttachOpen(false);
                } else {
                  setLocationStep("options");
                }
              }}
              className="press flex flex-col items-center gap-1.5 rounded-2xl border border-border bg-secondary py-3 text-[12px] font-medium"
            >
              <Icon className="size-5 text-primary" />
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Submenú de ubicación: actual vs en tiempo real (con duración). */}
      {isAttachOpen && locationStep !== null && (
        <div className="mb-2 space-y-2 rounded-2xl border border-border bg-secondary p-2">
          <div className="flex items-center gap-2 px-1">
            <p className="flex-1 text-[13px] font-semibold tracking-tight">
              {locationStep === "options" ? "Ubicación" : "¿Por cuánto tiempo?"}
            </p>
            <button
              type="button"
              aria-label="Cerrar ubicación"
              onClick={() => setLocationStep(null)}
              className="press grid size-7 place-items-center rounded-full text-muted-foreground"
            >
              <X className="size-4" />
            </button>
          </div>

          {locationStep === "options" ? (
            <>
              <button
                type="button"
                onClick={() => {
                  handlers.onShareCurrentLocation();
                  closeAttach();
                }}
                className="press touch-target flex w-full items-center gap-3 rounded-xl bg-surface px-3 text-left text-[15px] font-medium active:bg-secondary"
              >
                <MapPin className="size-5 text-primary" />
                Ubicación actual
              </button>
              <button
                type="button"
                onClick={() => setLocationStep("duration")}
                className="press touch-target flex w-full items-center gap-3 rounded-xl bg-surface px-3 text-left text-[15px] font-medium active:bg-secondary"
              >
                <NavigationArrow className="size-5 text-accent-warm" />
                Ubicación en tiempo real
              </button>
            </>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {LIVE_LOCATION_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    handlers.onStartLiveLocation(option.value);
                    closeAttach();
                  }}
                  className="press touch-target rounded-xl bg-surface px-2 text-[14px] font-medium tracking-tight active:bg-secondary"
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {isRecording ? (
        <div className="flex items-center gap-3 pb-2">
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
            aria-label="Enviar nota de voz"
            onPointerUp={() => stopRecording(true)}
            onClick={() => stopRecording(true)}
            className="pulse-warm press grid size-11 shrink-0 place-items-center rounded-full bg-accent-warm text-accent-warm-foreground"
          >
            <Send className="size-5" />
          </button>
        </div>
      ) : (
        <div className="flex items-end gap-2 pb-2">
          <button
            type="button"
            aria-label="Adjuntar"
            onClick={() => {
              setLocationStep(null);
              setAttachOpen((prev) => !prev);
            }}
            className={cn(
              "press touch-target grid place-items-center rounded-full text-muted-foreground",
              isAttachOpen && "bg-secondary text-primary",
            )}
          >
            <Paperclip className="size-5" />
          </button>
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submitText();
              }
            }}
            rows={1}
            placeholder="Mensaje"
            className="max-h-28 min-h-11 flex-1 resize-none rounded-2xl border border-border bg-secondary px-3.5 py-2.5 text-[16px] leading-snug outline-none placeholder:text-muted-foreground focus:border-ring"
          />
          {hasText ? (
            <button
              type="button"
              aria-label={editing ? "Guardar cambios" : "Enviar mensaje"}
              onClick={submitText}
              className="press grid size-11 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground"
            >
              <Send className="size-5" />
            </button>
          ) : (
            <button
              type="button"
              aria-label="Mantener presionado para grabar nota de voz"
              onPointerDown={startRecording}
              className="press grid size-11 shrink-0 place-items-center rounded-full border border-accent-warm/40 bg-accent-warm/10 text-accent-warm-foreground dark:text-accent-warm"
            >
              <Mic className="size-5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
