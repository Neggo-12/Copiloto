import { Users } from "@/components/shared/icons";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/shared/Avatar";
import type { Chat, UserProfile } from "@/lib/domain/types";
import { getOtherParticipantIds } from "@/lib/actions/groups";

/**
 * Avatar de chat: para grupos muestra fotos superpuestas (o ícono de grupo),
 * para chats 1 a 1 delega en el Avatar normal.
 */
export function ChatAvatar({
  chat,
  participants,
  size = "md",
}: {
  chat: Chat;
  participants: Record<string, UserProfile>;
  size?: "sm" | "md" | "lg";
}) {
  if (!chat.isGroup) return <Avatar name={chat.title} avatarUrl={chat.avatarUrl} size={size} />;
  if (chat.avatarUrl) return <Avatar name={chat.title} avatarUrl={chat.avatarUrl} size={size} />;

  const boxes = { sm: "size-9", md: "size-12", lg: "size-14" } as const;
  const stack = { sm: "size-6 text-[9px]", md: "size-8 text-[10px]", lg: "size-9 text-[11px]" } as const;
  const members = getOtherParticipantIds(chat).slice(0, 2);

  return (
    <div className={cn("relative shrink-0", boxes[size])} aria-hidden>
      {members.length >= 2 ? (
        <>
          <span
            className={cn(
              "absolute top-0 left-0 grid place-items-center overflow-hidden rounded-full border border-surface bg-accent font-semibold text-accent-foreground",
              stack[size],
            )}
          >
            {initials(participants[members[0] as string]?.displayName ?? "?")}
          </span>
          <span
            className={cn(
              "absolute right-0 bottom-0 grid place-items-center overflow-hidden rounded-full border border-surface bg-secondary font-semibold text-foreground",
              stack[size],
            )}
          >
            {initials(participants[members[1] as string]?.displayName ?? "?")}
          </span>
        </>
      ) : (
        <span
          className={cn(
            "grid size-full place-items-center rounded-full border border-border bg-accent text-accent-foreground",
          )}
        >
          <Users className="size-5" />
        </span>
      )}
    </div>
  );
}

function initials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}
