import { Check, CheckCheck, Clock, FileText, ImageIcon, CornerUpLeft, AlertCircle, MapPin, Timer } from "@/components/shared/icons";
import { useRef, useState } from "react";
import { VoiceNotePlayer } from "@/components/chats/VoiceNotePlayer";
import { formatClock, formatFileSize } from "@/lib/format";
import {
  formatLiveRemaining,
  isLiveLocationActive,
  openLocationInMaps,
  previewForMessage,
  summarizeReactions,
} from "@/lib/actions/chats";
import mapThumbnail from "@/assets/map-thumbnail.jpg";
import type { Message } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

/** Tarjeta de ubicación: miniatura de mapa simulada + dirección de ejemplo. */
function LocationCard({ message }: { message: Message }) {
  const attachment = message.attachment;
  const isLive = Boolean(attachment?.liveUntil);
  const active = isLiveLocationActive(message);

  return (
    <button
      type="button"
      onClick={() => openLocationInMaps(message)}
      aria-label="Abrir en Google Maps"
      className="press block w-56 text-left"
    >
      <span className="relative block overflow-hidden rounded-xl border border-border/50">
        <img
          src={mapThumbnail}
          alt="Miniatura del mapa de la ubicación compartida"
          loading="lazy"
          width={1024}
          height={640}
          className="h-28 w-full object-cover"
        />
        <span className="absolute inset-0 grid place-items-center">
          <MapPin className="size-7 text-primary drop-shadow" weight="fill" />
        </span>
        {isLive && (
          <span
            className={cn(
              "absolute top-1.5 left-1.5 flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
              active
                ? "bg-accent-warm text-accent-warm-foreground"
                : "bg-foreground/60 text-background",
            )}
          >
            {active && <span className="size-1.5 animate-pulse rounded-full bg-current" />}
            {active ? "En vivo" : "Finalizada"}
          </span>
        )}
      </span>
      <span className="mt-1.5 block text-[14px] leading-snug font-medium">
        {attachment?.address ?? message.body}
      </span>
      <span className="mt-0.5 block font-mono text-[12px] opacity-70">
        {isLive
          ? active
            ? `Termina en ${formatLiveRemaining(message)}`
            : "Ubicación en vivo finalizada"
          : "Toca para abrir en Google Maps"}
      </span>
    </button>
  );
}

function StatusTicks({ status }: { status: Message["status"] }) {
  if (status === "sending") return <Clock className="size-3.5 opacity-60" />;
  if (status === "failed") return <AlertCircle className="size-3.5 text-destructive" />;
  if (status === "sent") return <Check className="size-3.5 opacity-70" />;
  return <CheckCheck className={cn("size-3.5", status === "read" ? "opacity-100" : "opacity-70")} />;
}

/** Burbuja de mensaje con soporte de texto, voz, imagen y documento. */
export function MessageBubble({
  message,
  outgoing,
  quoted,
  onReply,
  onLongPress,
  onOpenReactions,
  showReactionCounts = false,
  senderName,
  firstOfGroup = true,
  lastOfGroup = true,
}: {
  message: Message;
  outgoing: boolean;
  quoted: Message | null;
  /** Nombre de quien envía; solo se muestra en chats de grupo. */
  senderName?: string | null;
  /** Posición dentro de una racha de mensajes del mismo remitente. */
  firstOfGroup?: boolean;
  lastOfGroup?: boolean;
  /** Muestra el contador junto al emoji (solo tiene sentido en grupos). */
  showReactionCounts?: boolean;
  onReply: () => void;
  onLongPress: () => void;
  /** Abre la lista de quién reaccionó. */
  onOpenReactions: () => void;
}) {
  const reactions = summarizeReactions(message);
  const [dragX, setDragX] = useState(0);
  const startX = useRef<number | null>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearPress = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = null;
  };

  return (
    <div
      className={cn(
        "flex px-3",
        outgoing ? "justify-end" : "justify-start",
        firstOfGroup && "mt-2",
        message.reactions.length > 0 && "mb-3",
      )}
      onPointerDown={(event) => {
        startX.current = event.clientX;
        pressTimer.current = setTimeout(onLongPress, 480);
      }}
      onPointerMove={(event) => {
        if (startX.current === null) return;
        const delta = event.clientX - startX.current;
        if (Math.abs(delta) > 8) clearPress();
        setDragX(Math.max(0, Math.min(64, delta)));
      }}
      onPointerUp={() => {
        clearPress();
        if (dragX > 44) onReply();
        setDragX(0);
        startX.current = null;
      }}
      onPointerCancel={() => {
        clearPress();
        setDragX(0);
        startX.current = null;
      }}
    >
      <div
        style={{ transform: `translate3d(${dragX}px,0,0)` }}
        className="relative max-w-[80%] transition-transform duration-150 ease-[cubic-bezier(0.32,0.72,0,1)]"
      >
        {dragX > 10 && (
          <CornerUpLeft className="absolute top-1/2 -left-8 size-5 -translate-y-1/2 text-muted-foreground" />
        )}
        <div
          className={cn(
            // Sin cola: burbujas completamente redondeadas (~20px) con radio
            // reducido entre mensajes contiguos del mismo remitente.
            "rounded-[20px] px-3.5 py-2",
            outgoing
              ? "bg-bubble-out text-bubble-out-foreground"
              : "border border-border/60 bg-bubble-in text-bubble-in-foreground",
            outgoing && !firstOfGroup && "rounded-tr-[8px]",
            outgoing && !lastOfGroup && "rounded-br-[8px]",
            !outgoing && !firstOfGroup && "rounded-tl-[8px]",
            !outgoing && !lastOfGroup && "rounded-bl-[8px]",
          )}
        >
          {!outgoing && senderName && firstOfGroup && (
            <p className="mb-0.5 text-[13px] font-semibold tracking-tight text-primary">
              {senderName}
            </p>
          )}


          {message.forwardedFromChatId && (
            <p className="mb-1 text-[12px] font-medium opacity-65">Reenviado</p>
          )}

          {quoted && (
            <div className="mb-1.5 rounded-xl border-l-2 border-primary bg-foreground/5 px-2 py-1.5">
              <p className="line-clamp-2 text-[13px] opacity-75">{previewForMessage(quoted)}</p>
            </div>
          )}

          {/* Cita del estado cuando el mensaje es respuesta a una historia. */}
          {message.statusReply && (
            <div className="mb-1.5 rounded-xl border-l-2 border-accent bg-foreground/5 px-2 py-1.5">
              <p className="text-[11px] font-semibold tracking-tight text-accent">
                Respuesta a un estado
              </p>
              <p className="line-clamp-2 text-[13px] opacity-75">{message.statusReply.preview}</p>
            </div>
          )}

          {message.deletedAt ? (
            <p className="text-[15px] italic opacity-60">Este mensaje fue eliminado</p>
          ) : message.kind === "voice" && message.attachment ? (
            <VoiceNotePlayer
              durationSeconds={message.attachment.durationSeconds ?? 0}
              waveform={message.attachment.waveform}
              outgoing={outgoing}
            />
          ) : message.kind === "image" ? (
            <div className="w-48">
              <div className="grid h-32 place-items-center rounded-xl border border-border/50 bg-secondary">
                <ImageIcon className="size-7 text-muted-foreground" />
              </div>
              <p className="mt-1 truncate text-[12px] opacity-70">
                {message.attachment?.fileName}
              </p>
            </div>
          ) : message.kind === "location" ? (
            <LocationCard message={message} />
          ) : message.kind === "document" ? (
            <div className="flex w-52 items-center gap-2.5">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-foreground/8">
                <FileText className="size-5" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[14px] font-medium">
                  {message.attachment?.fileName}
                </span>
                <span className="block font-mono text-[12px] opacity-70">
                  {formatFileSize(message.attachment?.fileSizeBytes)}
                </span>
              </span>
            </div>
          ) : (
            <p className="text-[15px] leading-snug whitespace-pre-wrap break-words">
              {message.body}
            </p>
          )}

          <div className="mt-1 flex items-center justify-end gap-1">
            {message.editedAt && <span className="text-[11px] opacity-60">editado</span>}
            {message.disappearingTtlSeconds !== null && (
              <Timer className="size-3.5 opacity-70" aria-label="Mensaje que desaparece" />
            )}
            <span className="font-mono text-[11px] opacity-65">
              {formatClock(message.createdAt)}
            </span>
            {outgoing && !message.deletedAt && <StatusTicks status={message.status} />}
          </div>
        </div>

        {reactions.length > 0 && !message.deletedAt && (
          <button
            type="button"
            onClick={onOpenReactions}
            aria-label="Ver reacciones"
            className={cn(
              "press absolute -bottom-2.5 flex items-center gap-0.5 rounded-full border border-border/70 bg-surface px-1.5 py-0.5 shadow-sheet",
              outgoing ? "right-2" : "left-2",
            )}
          >
            {reactions.map((entry) => (
              <span key={entry.emoji} className="flex items-center gap-0.5 text-[13px] leading-none">
                {entry.emoji}
                {showReactionCounts && entry.count > 1 && (
                  <span className="font-mono text-[11px] text-muted-foreground">{entry.count}</span>
                )}
              </span>
            ))}
          </button>
        )}
      </div>
    </div>
  );
}
