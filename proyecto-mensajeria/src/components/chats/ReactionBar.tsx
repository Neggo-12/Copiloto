import { Plus } from "@/components/shared/icons";
import { QUICK_REACTIONS } from "@/lib/actions/chats";
import { cn } from "@/lib/utils";

/**
 * Barra rápida de reacciones (6 emojis + "+" para el selector completo).
 * Se usa dentro de la hoja de acciones del mensaje.
 */
export function ReactionBar({
  activeEmoji,
  onPick,
  onOpenPicker,
}: {
  /** Emoji con el que ya reaccionó el usuario actual, si aplica. */
  activeEmoji: string | null;
  onPick: (emoji: string) => void;
  onOpenPicker: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-1 px-3 pt-3">
      {QUICK_REACTIONS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          aria-label={`Reaccionar con ${emoji}`}
          aria-pressed={activeEmoji === emoji}
          onClick={() => onPick(emoji)}
          className={cn(
            "press touch-target grid flex-1 place-items-center rounded-full text-[24px] active:bg-secondary",
            activeEmoji === emoji && "bg-primary/12 ring-1 ring-primary/40",
          )}
        >
          {emoji}
        </button>
      ))}
      <button
        type="button"
        aria-label="Abrir selector de emojis"
        onClick={onOpenPicker}
        className="press touch-target grid size-11 shrink-0 place-items-center rounded-full border border-border text-muted-foreground active:bg-secondary"
      >
        <Plus className="size-5" />
      </button>
    </div>
  );
}
