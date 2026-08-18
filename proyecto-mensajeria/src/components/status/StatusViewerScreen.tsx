import { ChevronUp, Eye, Send, X } from "@/components/shared/icons";
import { useEffect, useMemo, useRef, useState } from "react";
import { Avatar } from "@/components/shared/Avatar";
import { STATUS_SEGMENT_MS, buildStatusReply } from "@/lib/actions/status";
import { formatChatTimestamp } from "@/lib/format";
import type { StatusReplyRef, StatusUpdate, UserId, UserProfile } from "@/lib/domain/types";

/**
 * Visor de estados a pantalla completa: barra segmentada con avance
 * automático, toques laterales para navegar, mantener presionado para pausar
 * y deslizar hacia abajo para cerrar.
 */
export function StatusViewerScreen({
  statuses,
  author,
  isOwn,
  participants,
  onClose,
  onViewed,
  onReply,
}: {
  statuses: StatusUpdate[];
  author: UserProfile | null;
  /** true cuando son tus propios estados: muestra "Visto por N". */
  isOwn: boolean;
  participants: Record<UserId, UserProfile>;
  onClose: () => void;
  onViewed: (statusId: string) => void;
  onReply: (body: string, statusReply: StatusReplyRef) => void;
}) {
  const [index, setIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [isPaused, setPaused] = useState(false);
  const [isViewersOpen, setViewersOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const dragStartY = useRef<number | null>(null);

  const current = statuses[index];

  /** Marca como visto cada estado al mostrarse. */
  useEffect(() => {
    if (current) onViewed(current.id);
  }, [current?.id]);

  /** Avance automático segmentado (pausado al mantener presionado). */
  useEffect(() => {
    setProgress(0);
    if (!current) return;
    if (isPaused || isViewersOpen) return;
    const step = 100 / (STATUS_SEGMENT_MS / 50);
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev + step >= 100) {
          clearInterval(interval);
          goNext();
          return 100;
        }
        return prev + step;
      });
    }, 50);
    return () => clearInterval(interval);
  }, [current?.id, isPaused, isViewersOpen]);

  const viewers = useMemo(
    () => [...(current?.views ?? [])].sort((a, b) => b.viewedAt.localeCompare(a.viewedAt)),
    [current],
  );

  function goNext() {
    setIndex((prev) => {
      if (prev + 1 >= statuses.length) {
        onClose();
        return prev;
      }
      return prev + 1;
    });
  }

  function goPrev() {
    setIndex((prev) => Math.max(0, prev - 1));
  }

  if (!current) return null;

  const background =
    current.kind === "text" ? current.backgroundColor ?? "#5B4FE5" : "#0B0F19";

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col text-white"
      style={{ backgroundColor: background }}
      onPointerDown={(event) => {
        dragStartY.current = event.clientY;
        setPaused(true);
      }}
      onPointerUp={(event) => {
        const startY = dragStartY.current;
        dragStartY.current = null;
        setPaused(false);
        if (startY !== null && event.clientY - startY > 90) {
          onClose();
          return;
        }
        if (startY !== null && startY - event.clientY > 90) {
          if (isOwn) setViewersOpen(true);
          return;
        }
        const target = event.currentTarget.getBoundingClientRect();
        if (event.clientY - target.top > target.height - 120) return; // zona del pie
        if (event.clientX - target.left < target.width * 0.33) goPrev();
        else goNext();
      }}
    >
      {/* Barra de progreso segmentada */}
      <div className="safe-top flex gap-1 px-3 pt-3">
        {statuses.map((status, position) => (
          <span key={status.id} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/30">
            <span
              className="block h-full rounded-full bg-white transition-[width] duration-75"
              style={{
                width:
                  position < index ? "100%" : position === index ? `${progress}%` : "0%",
              }}
            />
          </span>
        ))}
      </div>

      <header className="flex items-center gap-3 px-4 py-3">
        <Avatar name={author?.displayName ?? "Yo"} avatarUrl={author?.avatarUrl ?? null} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold tracking-tight">
            {isOwn ? "Tu estado" : author?.displayName ?? "Contacto"}
          </p>
          <p className="font-mono text-[12px] text-white/70">
            {formatChatTimestamp(current.createdAt)}
          </p>
        </div>
        <button
          type="button"
          aria-label="Cerrar"
          onPointerUp={(event) => event.stopPropagation()}
          onClick={onClose}
          className="press touch-target grid place-items-center rounded-full text-white/90"
        >
          <X className="size-6" />
        </button>
      </header>

      {/* Contenido */}
      <div className="grid min-h-0 flex-1 place-items-center px-6">
        {current.kind === "media" ? (
          <figure className="flex max-h-full flex-col items-center gap-3">
            <img
              src={current.mediaUrl ?? ""}
              alt={current.body || "Estado"}
              loading="lazy"
              width={720}
              height={1280}
              className="max-h-[58dvh] w-auto rounded-2xl object-contain"
            />
            {current.body && (
              <figcaption className="text-center text-[16px] leading-snug">
                {current.body}
              </figcaption>
            )}
          </figure>
        ) : (
          <p className="text-center text-[26px] leading-snug font-semibold tracking-tight">
            {current.body}
          </p>
        )}
      </div>

      {/* Pie: responder (contactos) o "Visto por N" (estado propio) */}
      <div
        className="safe-bottom shrink-0 px-4 pt-3"
        onPointerUp={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        {isOwn ? (
          <button
            type="button"
            onClick={() => setViewersOpen(true)}
            className="press touch-target flex w-full items-center justify-center gap-2 rounded-full bg-white/15 text-[15px] font-medium"
          >
            <Eye className="size-5" />
            Visto por {current.views.length}
            <ChevronUp className="size-4" />
          </button>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!draft.trim()) return;
              onReply(draft, buildStatusReply(current));
              setDraft("");
            }}
            className="flex items-center gap-2"
          >
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onFocus={() => setPaused(true)}
              onBlur={() => setPaused(false)}
              placeholder="Responder…"
              className="touch-target min-w-0 flex-1 rounded-full border border-white/30 bg-white/10 px-4 text-[16px] text-white outline-none placeholder:text-white/60"
            />
            <button
              type="submit"
              aria-label="Enviar respuesta"
              disabled={!draft.trim()}
              className="press grid size-11 shrink-0 place-items-center rounded-full bg-white text-[color:#5B4FE5] disabled:opacity-50"
            >
              <Send className="size-5" />
            </button>
          </form>
        )}
      </div>

      {/* Lista de quién vio el estado (deslizar hacia arriba o botón). */}
      {isViewersOpen && (
        <div
          className="absolute inset-x-0 bottom-0 z-10 max-h-[60dvh] animate-in slide-in-from-bottom rounded-t-3xl bg-surface text-foreground"
          onPointerUp={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-border/70 px-5 py-3">
            <h2 className="text-[17px] font-semibold tracking-tight">
              Visto por {viewers.length}
            </h2>
            <button
              type="button"
              onClick={() => setViewersOpen(false)}
              aria-label="Cerrar"
              className="press touch-target grid place-items-center rounded-full text-muted-foreground"
            >
              <X className="size-5" />
            </button>
          </div>
          {viewers.length === 0 ? (
            <p className="px-8 py-12 text-center text-[15px] text-muted-foreground">
              Todavía nadie lo ha visto. Dale unos minutos.
            </p>
          ) : (
            <ul className="max-h-[46dvh] divide-y divide-border/70 overflow-y-auto">
              {viewers.map((view) => (
                <li key={view.viewerId} className="flex items-center gap-3 px-5 py-3">
                  <Avatar
                    name={participants[view.viewerId]?.displayName ?? "Contacto"}
                    avatarUrl={participants[view.viewerId]?.avatarUrl ?? null}
                    size="sm"
                  />
                  <span className="flex-1 truncate text-[15px] font-medium">
                    {participants[view.viewerId]?.displayName ?? "Contacto"}
                  </span>
                  <span className="font-mono text-[12px] text-muted-foreground">
                    {formatChatTimestamp(view.viewedAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
