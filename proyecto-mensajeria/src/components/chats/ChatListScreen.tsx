import {
  Archive,
  ArchiveRestore,
  Bell,
  BellOff,
  ChevronRight,
  MessageSquarePlus,
  Pin,
  PinOff,
  Plus,
  Search,
  Trash2,
  Users,
} from "@/components/shared/icons";
import { useEffect, useMemo, useRef, useState } from "react";
import { BottomSheet } from "@/components/shared/BottomSheet";
import { ChatAvatar } from "@/components/chats/GroupAvatar";
import { PhoneScreen } from "@/components/shared/PhoneScreen";
import { SwipeableRow } from "@/components/chats/SwipeableRow";
import { RecipientPicker } from "@/components/chats/RecipientPicker";
import { DetailScreen } from "@/components/shared/DetailScreen";
import { MUTE_OPTIONS, describeMute } from "@/lib/actions/chats";
import { formatChatTimestamp } from "@/lib/format";
import type { Chat, ChatId, Contact, MessageId, UserProfile } from "@/lib/domain/types";
import type { ChatsController } from "@/hooks/useChats";
import type { ReactNode } from "react";

/** Pantalla 1: lista de conversaciones con buscador global, swipe y organización. */
export function ChatListScreen({
  controller,
  contacts,
  onOpenChat,
  onStartGroup,
  tabBar,
  statusRow,
}: {
  controller: ChatsController;
  /** Contactos reales provenientes de la pestaña Contactos. */
  contacts: Contact[];
  /** Abre un chat; con `messageId` hace scroll y resalta ese mensaje. */
  onOpenChat: (chatId: ChatId, messageId?: MessageId) => void;
  /** Inicia el flujo de grupo nuevo con los participantes elegidos. */
  onStartGroup: (members: Contact[]) => void;
  tabBar: ReactNode;
  /** Fila horizontal de Estados, encima del buscador. */
  statusRow?: ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [isPickerOpen, setPickerOpen] = useState(false);
  const [isGroupPickerOpen, setGroupPickerOpen] = useState(false);
  const [isCreateSheetOpen, setCreateSheetOpen] = useState(false);
  const [isArchivedOpen, setArchivedOpen] = useState(false);
  const [menuFor, setMenuFor] = useState<Chat | null>(null);
  const [muteFor, setMuteFor] = useState<Chat | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const results = useMemo(() => controller.search(query), [controller, query]);
  const messageGroups = useMemo(() => controller.searchMessages(query), [controller, query]);
  const archived = controller.archivedChats;
  const isSearching = query.trim().length > 0;

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 2600);
    return () => clearTimeout(timer);
  }, [notice]);

  const swipeActions = (chat: Chat) => [
    {
      label: chat.isPinned ? "Desfijar" : "Fijar",
      icon: chat.isPinned ? <PinOff className="size-5" /> : <Pin className="size-5" />,
      onAction: () => {
        if (chat.isPinned) controller.unpinChat(chat.id);
        else setNotice(controller.pinChat(chat.id));
      },
    },
    {
      label: "Archivar",
      icon: <Archive className="size-5" />,
      onAction: () => controller.archiveChat(chat.id),
    },
    {
      label: "Eliminar",
      icon: <Trash2 className="size-5" />,
      onAction: () => controller.removeChat(chat.id),
      variant: "destructive" as const,
    },
  ];

  if (isArchivedOpen) {
    return (
      <DetailScreen onBack={() => setArchivedOpen(false)} title="Archivados">
        {archived.length === 0 ? (
          <p className="px-8 py-16 text-center text-[15px] leading-relaxed text-muted-foreground">
            Aquí guardamos lo que quieres fuera de vista. Por ahora está vacío.
          </p>
        ) : (
          <ul className="divide-y divide-border/70 border-b border-border/70">
            {archived.map((chat) => (
              <li key={chat.id}>
                <SwipeableRow
                  actions={[
                    {
                      label: "Desarchivar",
                      icon: <ArchiveRestore className="size-5" />,
                      onAction: () => controller.unarchiveChat(chat.id),
                    },
                    {
                      label: "Eliminar",
                      icon: <Trash2 className="size-5" />,
                      onAction: () => controller.removeChat(chat.id),
                      variant: "destructive",
                    },
                  ]}
                >
                  <ChatRow
                    chat={chat}
                    participants={controller.participants}
                    onOpen={() => onOpenChat(chat.id)}
                    onLongPress={() => setMenuFor(chat)}
                  />
                </SwipeableRow>
              </li>
            ))}
          </ul>
        )}
        <ChatOrganizeSheets
          controller={controller}
          menuFor={menuFor}
          muteFor={muteFor}
          onCloseMenu={() => setMenuFor(null)}
          onCloseMute={() => setMuteFor(null)}
          onOpenMute={(chat) => setMuteFor(chat)}
          onNotice={setNotice}
        />
        <Notice message={notice} />
      </DetailScreen>
    );
  }

  return (
    <PhoneScreen title="Chats" showThemeToggle className="justify-between">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {!isSearching && statusRow}
        <div className="sticky top-0 z-10 bg-background/90 px-4 py-3 backdrop-blur">
          <label className="flex items-center gap-2 rounded-2xl border border-border bg-secondary px-3">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar chats y mensajes"
              className="touch-target w-full bg-transparent text-[16px] outline-none placeholder:text-muted-foreground"
            />
          </label>
        </div>

        {!isSearching && archived.length > 0 && (
          <button
            type="button"
            onClick={() => setArchivedOpen(true)}
            className="touch-target flex w-full items-center gap-3 border-y border-border/70 px-4 text-left active:bg-secondary"
          >
            <Archive className="size-5 text-muted-foreground" />
            <span className="flex-1 text-[15px] font-medium">Archivados</span>
            <span className="font-mono text-[13px] text-muted-foreground">{archived.length}</span>
            <ChevronRight className="size-4 text-muted-foreground" />
          </button>
        )}

        {isSearching ? (
          <SearchResults
            chats={results}
            groups={messageGroups}
            participants={controller.participants}
            query={query}
            onOpenChat={onOpenChat}
          />
        ) : results.length === 0 ? (
          <p className="px-8 py-16 text-center text-[15px] leading-relaxed text-muted-foreground">
            Tu copiloto está listo. Toca + y empieza la primera conversación.
          </p>
        ) : (
          <ul className="divide-y divide-border/70 border-y border-border/70">
            {results.map((chat) => (
              <li key={chat.id}>
                <SwipeableRow actions={swipeActions(chat)}>
                  <ChatRow
                    chat={chat}
                    participants={controller.participants}
                    onOpen={() => onOpenChat(chat.id)}
                    onLongPress={() => setMenuFor(chat)}
                  />
                </SwipeableRow>
              </li>
            ))}
          </ul>
        )}
        <div className="h-24" />
      </div>

      <button
        type="button"
        onClick={() => setCreateSheetOpen(true)}
        aria-label="Chat nuevo"
        className="press absolute right-5 bottom-24 grid size-14 place-items-center rounded-full bg-primary text-primary-foreground shadow-sheet"
      >
        <Plus className="size-7" />
      </button>

      {tabBar}

      <Notice message={notice} />

      <ChatOrganizeSheets
        controller={controller}
        menuFor={menuFor}
        muteFor={muteFor}
        onCloseMenu={() => setMenuFor(null)}
        onCloseMute={() => setMuteFor(null)}
        onOpenMute={(chat) => setMuteFor(chat)}
        onNotice={setNotice}
      />

      <BottomSheet open={isCreateSheetOpen} title="Nuevo" onClose={() => setCreateSheetOpen(false)}>
        <ul className="p-2 pb-4">
          <li>
            <button
              type="button"
              onClick={() => {
                setCreateSheetOpen(false);
                setPickerOpen(true);
              }}
              className="press touch-target flex w-full items-center gap-3 rounded-2xl px-4 text-[16px] font-medium active:bg-secondary"
            >
              <MessageSquarePlus className="size-5 text-primary" /> Nuevo chat
            </button>
          </li>
          <li>
            <button
              type="button"
              onClick={() => {
                setCreateSheetOpen(false);
                setGroupPickerOpen(true);
              }}
              className="press touch-target flex w-full items-center gap-3 rounded-2xl px-4 text-[16px] font-medium active:bg-secondary"
            >
              <Users className="size-5 text-primary" /> Nuevo grupo
            </button>
          </li>
        </ul>
      </BottomSheet>

      <RecipientPicker
        open={isGroupPickerOpen}
        title="Participantes del grupo"
        contacts={contacts.filter((contact) => contact.hasAppAccount)}
        multiSelect
        confirmLabel="Continuar"
        onConfirmSelection={(selected) => {
          setGroupPickerOpen(false);
          onStartGroup(selected);
        }}
        onClose={() => setGroupPickerOpen(false)}
      />

      <RecipientPicker
        open={isPickerOpen}
        title="Chat nuevo"
        contacts={contacts}
        onPickContact={(contact) => {
          if (!contact.linkedUserId) return;
          setPickerOpen(false);
          void controller
            .startChatWithUser(contact.linkedUserId, contact.displayName, contact.avatarUrl)
            .then((chatId) => {
              if (chatId) onOpenChat(chatId);
            });
        }}
        onClose={() => setPickerOpen(false)}
      />
    </PhoneScreen>
  );
}

/** Aviso simple y efímero (por ejemplo, al superar el máximo de fijados). */
function Notice({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      role="status"
      className="pointer-events-none absolute inset-x-4 bottom-40 z-30 animate-in fade-in slide-in-from-bottom rounded-2xl border border-border bg-surface px-4 py-3 text-center text-[14px] font-medium shadow-sheet"
    >
      {message}
    </div>
  );
}

/** Menú de mantener presionado + hoja de duración de silencio. */
function ChatOrganizeSheets({
  controller,
  menuFor,
  muteFor,
  onCloseMenu,
  onCloseMute,
  onOpenMute,
  onNotice,
}: {
  controller: ChatsController;
  menuFor: Chat | null;
  muteFor: Chat | null;
  onCloseMenu: () => void;
  onCloseMute: () => void;
  onOpenMute: (chat: Chat) => void;
  onNotice: (message: string | null) => void;
}) {
  return (
    <>
      <BottomSheet open={Boolean(menuFor)} title={menuFor?.title ?? ""} onClose={onCloseMenu}>
        {menuFor && (
          <ul className="p-2 pb-4">
            <MenuAction
              icon={menuFor.isPinned ? <PinOff className="size-5" /> : <Pin className="size-5" />}
              label={menuFor.isPinned ? "Desfijar chat" : "Fijar chat"}
              onClick={() => {
                if (menuFor.isPinned) controller.unpinChat(menuFor.id);
                else onNotice(controller.pinChat(menuFor.id));
                onCloseMenu();
              }}
            />
            {menuFor.isMuted ? (
              <MenuAction
                icon={<Bell className="size-5" />}
                label="Activar notificaciones"
                hint={describeMute(menuFor)}
                onClick={() => {
                  controller.unmuteChat(menuFor.id);
                  onCloseMenu();
                }}
              />
            ) : (
              <MenuAction
                icon={<BellOff className="size-5" />}
                label="Silenciar…"
                onClick={() => {
                  onOpenMute(menuFor);
                  onCloseMenu();
                }}
              />
            )}
            <MenuAction
              icon={
                menuFor.archivedAt ? (
                  <ArchiveRestore className="size-5" />
                ) : (
                  <Archive className="size-5" />
                )
              }
              label={menuFor.archivedAt ? "Desarchivar" : "Archivar"}
              onClick={() => {
                if (menuFor.archivedAt) controller.unarchiveChat(menuFor.id);
                else controller.archiveChat(menuFor.id);
                onCloseMenu();
              }}
            />
            <MenuAction
              icon={<Trash2 className="size-5" />}
              label="Eliminar chat"
              destructive
              onClick={() => {
                controller.removeChat(menuFor.id);
                onCloseMenu();
              }}
            />
          </ul>
        )}
      </BottomSheet>

      <BottomSheet open={Boolean(muteFor)} title="Silenciar durante" onClose={onCloseMute}>
        <ul className="p-2 pb-4">
          {MUTE_OPTIONS.map((option) => (
            <li key={option.value}>
              <button
                type="button"
                onClick={() => {
                  if (muteFor) controller.muteChat(muteFor.id, option.value);
                  onCloseMute();
                }}
                className="press touch-target flex w-full items-center gap-3 rounded-2xl px-4 text-[16px] font-medium active:bg-secondary"
              >
                <BellOff className="size-5 text-muted-foreground" />
                {option.label}
              </button>
            </li>
          ))}
        </ul>
      </BottomSheet>
    </>
  );
}

function MenuAction({
  icon,
  label,
  hint,
  destructive,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  hint?: string;
  destructive?: boolean;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={`press touch-target flex w-full items-center gap-3 rounded-2xl px-4 text-left text-[16px] font-medium active:bg-secondary ${
          destructive ? "text-destructive" : ""
        }`}
      >
        {icon}
        <span className="flex-1">
          {label}
          {hint && (
            <span className="block text-[12px] font-normal text-muted-foreground">{hint}</span>
          )}
        </span>
      </button>
    </li>
  );
}

/** Resultados de búsqueda: chats por nombre + mensajes agrupados por chat. */
function SearchResults({
  chats,
  groups,
  participants,
  query,
  onOpenChat,
}: {
  chats: Chat[];
  groups: ReturnType<ChatsController["searchMessages"]>;
  participants: Record<string, UserProfile>;
  query: string;
  onOpenChat: (chatId: ChatId, messageId?: MessageId) => void;
}) {
  if (chats.length === 0 && groups.length === 0) {
    return (
      <p className="px-8 py-16 text-center text-[15px] leading-relaxed text-muted-foreground">
        No encontramos chats ni mensajes con “{query}”.
      </p>
    );
  }

  return (
    <div className="pb-4">
      {chats.length > 0 && (
        <section>
          <h2 className="px-4 pt-4 pb-1 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
            Chats
          </h2>
          <ul className="divide-y divide-border/70 border-y border-border/70">
            {chats.map((chat) => (
              <li key={chat.id}>
                <ChatRow
                  chat={chat}
                  participants={participants}
                  onOpen={() => onOpenChat(chat.id)}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      {groups.length > 0 && (
        <section>
          <h2 className="px-4 pt-5 pb-1 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
            Mensajes
          </h2>
          {groups.map((group) => (
            <div key={group.chat.id} className="border-y border-border/70">
              <p className="flex items-center gap-2 bg-secondary/60 px-4 py-2 text-[13px] font-semibold tracking-tight">
                {group.chat.isGroup && <Users className="size-3.5 text-muted-foreground" />}
                {group.chat.title}
                <span className="ml-auto font-mono text-[11px] font-normal text-muted-foreground">
                  {group.hits.length}
                </span>
              </p>
              <ul className="divide-y divide-border/60">
                {group.hits.map((hit) => (
                  <li key={hit.message.id}>
                    <button
                      type="button"
                      onClick={() => onOpenChat(group.chat.id, hit.message.id)}
                      className="flex w-full items-start gap-3 px-4 py-3 text-left active:bg-secondary"
                    >
                      <span className="min-w-0 flex-1 text-[14px] leading-snug text-muted-foreground">
                        <Highlighted text={hit.snippet} term={query.trim()} />
                      </span>
                      <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                        {formatChatTimestamp(hit.message.createdAt)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

/** Resalta la coincidencia dentro del fragmento de contexto. */
function Highlighted({ text, term }: { text: string; term: string }) {
  const index = text.toLowerCase().indexOf(term.toLowerCase());
  if (!term || index < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, index)}
      <mark className="rounded bg-accent-warm/25 px-0.5 text-foreground">
        {text.slice(index, index + term.length)}
      </mark>
      {text.slice(index + term.length)}
    </>
  );
}

function ChatRow({
  chat,
  participants,
  onOpen,
  onLongPress,
}: {
  chat: Chat;
  participants: Record<string, UserProfile>;
  onOpen: () => void;
  onLongPress?: () => void;
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  const activityLabel =
    chat.activity === "typing"
      ? "escribiendo…"
      : chat.activity === "recording_audio"
        ? "grabando audio…"
        : null;

  return (
    <button
      type="button"
      onClick={() => {
        if (longPressed.current) {
          longPressed.current = false;
          return;
        }
        onOpen();
      }}
      onPointerDown={() => {
        if (!onLongPress) return;
        longPressed.current = false;
        timer.current = setTimeout(() => {
          longPressed.current = true;
          onLongPress();
        }, 480);
      }}
      onPointerUp={clear}
      onPointerMove={clear}
      onPointerCancel={clear}
      onContextMenu={(event) => event.preventDefault()}
      className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-secondary"
    >
      <ChatAvatar chat={chat} participants={participants} />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className="flex min-w-0 flex-1 items-center gap-1.5">
            {chat.isPinned && <Pin className="size-3.5 shrink-0 text-accent-warm" />}
            {chat.isGroup && <Users className="size-3.5 shrink-0 text-muted-foreground" />}
            <span className="min-w-0 flex-1 truncate text-[16px] font-semibold tracking-tight">
              {chat.title}
            </span>
            {chat.isMuted && <BellOff className="size-3.5 shrink-0 text-muted-foreground" />}
          </span>
          <span className="shrink-0 font-mono text-[12px] text-muted-foreground">
            {formatChatTimestamp(chat.lastMessageAt)}
          </span>
        </span>
        <span className="mt-0.5 flex items-center gap-2">
          <span
            className={`min-w-0 flex-1 truncate text-[14px] ${
              activityLabel ? "font-medium text-accent-warm" : "text-muted-foreground"
            }`}
          >
            {activityLabel ?? chat.lastMessagePreview}
          </span>
          {chat.unreadCount > 0 && (
            <span className="grid min-w-5 shrink-0 place-items-center rounded-full bg-accent-warm px-1.5 font-mono text-[11px] font-semibold text-accent-warm-foreground">
              {chat.unreadCount}
            </span>
          )}
        </span>
      </span>
    </button>
  );
}
