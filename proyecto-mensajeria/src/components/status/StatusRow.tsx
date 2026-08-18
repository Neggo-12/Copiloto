import { Plus } from "@/components/shared/icons";
import { Avatar } from "@/components/shared/Avatar";
import type { StatusFeedEntry } from "@/lib/actions/status";
import type { StatusUpdate, UserId, UserProfile } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

/**
 * Fila horizontal desplazable de Estados, encima de la lista de chats.
 * Primera burbuja: "Tu estado" con "+"; luego los contactos con estados
 * activos, con anillo violeta→ámbar (sin ver) o gris (ya visto).
 */
export function StatusRow({
  currentUser,
  myStatuses,
  feed,
  participants,
  onCreateStatus,
  onOpenMyStatus,
  onOpenAuthor,
}: {
  currentUser: UserProfile | null;
  myStatuses: StatusUpdate[];
  feed: StatusFeedEntry[];
  participants: Record<UserId, UserProfile>;
  onCreateStatus: () => void;
  onOpenMyStatus: () => void;
  onOpenAuthor: (authorId: UserId) => void;
}) {
  const hasMine = myStatuses.length > 0;
  const mineUnseenRing = hasMine;

  return (
    <div className="border-b border-border/70 px-4 py-3">
      <div className="-mx-1 flex gap-4 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button
          type="button"
          onClick={hasMine ? onOpenMyStatus : onCreateStatus}
          className="press flex w-16 shrink-0 flex-col items-center gap-1.5"
        >
          <span className="relative">
            <StatusRing active={mineUnseenRing} seen={false}>
              <Avatar
                name={currentUser?.displayName ?? "Yo"}
                avatarUrl={currentUser?.avatarUrl ?? null}
                size="md"
              />
            </StatusRing>
            <span
              onClick={(event) => {
                event.stopPropagation();
                onCreateStatus();
              }}
              role="button"
              aria-label="Agregar estado"
              className="absolute -right-0.5 -bottom-0.5 grid size-5 place-items-center rounded-full border-2 border-background bg-primary text-primary-foreground"
            >
              <Plus className="size-3" weight="bold" />
            </span>
          </span>
          <span className="w-full truncate text-center text-[12px] font-medium">Tu estado</span>
        </button>

        {feed.map((entry) => {
          const author = participants[entry.authorId];
          return (
            <button
              key={entry.authorId}
              type="button"
              onClick={() => onOpenAuthor(entry.authorId)}
              className="press flex w-16 shrink-0 flex-col items-center gap-1.5"
            >
              <StatusRing active={entry.hasUnseen} seen={!entry.hasUnseen}>
                <Avatar
                  name={author?.displayName ?? "Contacto"}
                  avatarUrl={author?.avatarUrl ?? null}
                  size="md"
                />
              </StatusRing>
              <span className="w-full truncate text-center text-[12px] text-muted-foreground">
                {author?.displayName?.split(" ")[0] ?? "Contacto"}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Anillo alrededor del avatar: degradado de marca sin ver, gris ya visto. */
function StatusRing({
  active,
  seen,
  children,
}: {
  active: boolean;
  seen: boolean;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "grid size-14 place-items-center rounded-full p-[2px]",
        active && !seen && "bg-[linear-gradient(135deg,#5B4FE5,#F5A623)]",
        seen && "bg-border",
        !active && !seen && "bg-transparent",
      )}
    >
      <span className="grid size-full place-items-center rounded-full bg-background p-[2px]">
        {children}
      </span>
    </span>
  );
}
