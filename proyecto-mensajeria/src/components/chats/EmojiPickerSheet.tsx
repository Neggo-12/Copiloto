import { BottomSheet } from "@/components/shared/BottomSheet";
import { EMOJI_PICKER_SET } from "@/lib/actions/chats";
import { cn } from "@/lib/utils";

/** Selector completo de emojis (set curado en esta fase, sin backend). */
export function EmojiPickerSheet({
  open,
  activeEmoji,
  onPick,
  onClose,
}: {
  open: boolean;
  activeEmoji: string | null;
  onPick: (emoji: string) => void;
  onClose: () => void;
}) {
  return (
    <BottomSheet open={open} title="Elegir emoji" onClose={onClose}>
      <div className="grid grid-cols-6 gap-1 p-3">
        {EMOJI_PICKER_SET.map((emoji) => (
          <button
            key={emoji}
            type="button"
            aria-label={`Reaccionar con ${emoji}`}
            aria-pressed={activeEmoji === emoji}
            onClick={() => onPick(emoji)}
            className={cn(
              "press touch-target grid place-items-center rounded-2xl text-[26px] active:bg-secondary",
              activeEmoji === emoji && "bg-primary/12 ring-1 ring-primary/40",
            )}
          >
            {emoji}
          </button>
        ))}
      </div>
    </BottomSheet>
  );
}
