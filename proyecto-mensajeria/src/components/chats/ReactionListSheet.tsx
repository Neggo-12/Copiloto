import { Avatar } from "@/components/shared/Avatar";
import { BottomSheet } from "@/components/shared/BottomSheet";
import { CURRENT_USER_ID } from "@/lib/domain/mock-data";
import type { Message, UserId, UserProfile } from "@/lib/domain/types";

/** Lista simple de quién reaccionó y con qué; tocar la propia la quita. */
export function ReactionListSheet({
  message,
  participants,
  onRemoveOwnReaction,
  onClose,
}: {
  message: Message | null;
  participants: Record<UserId, UserProfile | undefined>;
  onRemoveOwnReaction: () => void;
  onClose: () => void;
}) {
  return (
    <BottomSheet open={Boolean(message)} title="Reacciones" onClose={onClose}>
      <ul className="divide-y divide-border/70 px-4">
        {(message?.reactions ?? []).map((reaction) => {
          const isMe = reaction.userId === CURRENT_USER_ID;
          const profile = participants[reaction.userId];
          const name = isMe ? "Tú" : (profile?.displayName ?? "Participante");
          return (
            <li key={`${reaction.userId}-${reaction.emoji}`}>
              <button
                type="button"
                disabled={!isMe}
                onClick={onRemoveOwnReaction}
                className="press touch-target flex w-full items-center gap-3 py-3 text-left disabled:cursor-default"
              >
                <Avatar name={name} avatarUrl={profile?.avatarUrl ?? null} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[16px] font-medium">{name}</span>
                  {isMe && (
                    <span className="block text-[13px] text-muted-foreground">
                      Toca para quitar tu reacción
                    </span>
                  )}
                </span>
                <span className="text-[22px]">{reaction.emoji}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </BottomSheet>
  );
}
