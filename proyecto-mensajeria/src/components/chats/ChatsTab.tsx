import { useState, type ReactNode } from "react";
import { ChatListScreen } from "@/components/chats/ChatListScreen";
import { ChatThreadScreen } from "@/components/chats/ChatThreadScreen";
import { GroupCreateScreen } from "@/components/chats/GroupCreateScreen";
import { GroupDetailScreen } from "@/components/chats/GroupDetailScreen";
import { ChatSettingsScreen } from "@/components/chats/ChatSettingsScreen";
import type { ChatsController } from "@/hooks/useChats";
import { StatusRow } from "@/components/status/StatusRow";
import { StatusComposerScreen } from "@/components/status/StatusComposerScreen";
import { StatusViewerScreen } from "@/components/status/StatusViewerScreen";
import { useStatuses } from "@/hooks/useStatuses";
import { useAppStore } from "@/store/AppStore";
import { CURRENT_USER_ID } from "@/lib/domain/mock-data";
import type { ChatId, Contact, UserId } from "@/lib/domain/types";

/** Pestaña Chats: lista, conversación, creación de grupo y detalle de grupo. */
export function ChatsTab({
  controller,
  contacts,
  tabBar,
  openChatId,
  onOpenChatIdChange,
}: {
  controller: ChatsController;
  /** Fuente única de contactos (pestaña Contactos). */
  contacts: Contact[];
  tabBar: ReactNode;
  openChatId: ChatId | null;
  onOpenChatIdChange: (chatId: ChatId | null) => void;
}) {
  const [groupDraft, setGroupDraft] = useState<Contact[] | null>(null);
  /** Mensaje objetivo cuando el chat se abre desde la búsqueda global. */
  const [highlightMessageId, setHighlightMessageId] = useState<string | null>(null);
  const [isGroupDetailOpen, setGroupDetailOpen] = useState(false);
  const statuses = useStatuses();
  const { currentUser } = useAppStore();
  /** Autor cuyos estados se están viendo a pantalla completa. */
  const [statusAuthorId, setStatusAuthorId] = useState<UserId | null>(null);
  const [isStatusComposerOpen, setStatusComposerOpen] = useState(false);

  const viewerStatuses = statusAuthorId
    ? statusAuthorId === CURRENT_USER_ID
      ? statuses.myStatuses
      : statuses.getStatusesByAuthor(statusAuthorId)
    : [];

  if (isStatusComposerOpen) {
    return (
      <StatusComposerScreen
        contacts={contacts}
        onBack={() => setStatusComposerOpen(false)}
        onPublish={(input) => {
          statuses.publishStatus(input);
          setStatusComposerOpen(false);
        }}
      />
    );
  }

  if (statusAuthorId && viewerStatuses.length > 0) {
    const isOwn = statusAuthorId === CURRENT_USER_ID;
    return (
      <StatusViewerScreen
        statuses={viewerStatuses}
        author={isOwn ? currentUser : controller.participants[statusAuthorId] ?? null}
        isOwn={isOwn}
        participants={controller.participants}
        onClose={() => setStatusAuthorId(null)}
        onViewed={statuses.markStatusViewed}
        onReply={(body, statusReply) => {
          const displayName =
            controller.participants[statusAuthorId]?.displayName ?? "Contacto";
          const chatId = controller.replyToStatus(statusAuthorId, displayName, body, statusReply);
          setStatusAuthorId(null);
          controller.openChat(chatId);
          onOpenChatIdChange(chatId);
        }}
      />
    );
  }

  if (groupDraft) {
    return (
      <GroupCreateScreen
        members={groupDraft}
        onRemoveMember={(contact) =>
          setGroupDraft((prev) => (prev ?? []).filter((item) => item.id !== contact.id))
        }
        onBack={() => setGroupDraft(null)}
        onCreate={(name, avatarUrl) => {
          const participantIds = groupDraft
            .map((contact) => contact.linkedUserId)
            .filter((id): id is string => Boolean(id));
          const result = controller.createGroup({ name, participantIds, avatarUrl });
          if (result.error) return result.error;
          setGroupDraft(null);
          if (result.chatId) {
            controller.openChat(result.chatId);
            onOpenChatIdChange(result.chatId);
          }
          return null;
        }}
      />
    );
  }

  const openChat = controller.state.chats.find((item) => item.id === openChatId);

  if (openChatId && isGroupDetailOpen && openChat && !openChat.isGroup) {
    return (
      <ChatSettingsScreen
        controller={controller}
        chatId={openChatId}
        onBack={() => setGroupDetailOpen(false)}
      />
    );
  }

  if (openChatId && isGroupDetailOpen) {
    return (
      <GroupDetailScreen
        controller={controller}
        contacts={contacts}
        chatId={openChatId}
        onBack={() => setGroupDetailOpen(false)}
        onExitGroup={() => {
          setGroupDetailOpen(false);
          onOpenChatIdChange(null);
        }}
      />
    );
  }

  if (openChatId) {
    return (
      <ChatThreadScreen
        controller={controller}
        chatId={openChatId}
        highlightMessageId={highlightMessageId}
        onBack={() => {
          setHighlightMessageId(null);
          onOpenChatIdChange(null);
        }}
        onOpenGroupDetail={() => setGroupDetailOpen(true)}
      />
    );
  }

  return (
    <ChatListScreen
      controller={controller}
      contacts={contacts}
      tabBar={tabBar}
      statusRow={
        <StatusRow
          currentUser={currentUser}
          myStatuses={statuses.myStatuses}
          feed={statuses.feed}
          participants={controller.participants}
          onCreateStatus={() => setStatusComposerOpen(true)}
          onOpenMyStatus={() => setStatusAuthorId(CURRENT_USER_ID)}
          onOpenAuthor={(authorId) => setStatusAuthorId(authorId)}
        />
      }
      onStartGroup={(members) => setGroupDraft(members)}
      onOpenChat={(chatId: ChatId, messageId?: string) => {
        controller.openChat(chatId);
        setHighlightMessageId(messageId ?? null);
        onOpenChatIdChange(chatId);
      }}
    />
  );
}
