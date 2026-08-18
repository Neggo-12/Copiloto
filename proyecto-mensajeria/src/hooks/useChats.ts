import { useCallback, useMemo, useState } from "react";
import * as chatActions from "@/lib/actions/chats";
import * as groupActions from "@/lib/actions/groups";
import type { ChatsState } from "@/lib/actions/chats";
import { MOCK_CHATS, MOCK_MESSAGES, MOCK_PARTICIPANTS } from "@/lib/domain/mock-data";
import type {
  ChatId,
  DisappearingTtlSeconds,
  MessageId,
  StatusReplyRef,
  UserId,
} from "@/lib/domain/types";

const INITIAL_STATE: ChatsState = { chats: MOCK_CHATS, messages: MOCK_MESSAGES };

/**
 * Controlador de la pestaña Chats: expone las acciones aisladas ya vinculadas
 * al estado local. Al conectar el backend real solo cambia la implementación
 * interna, no las firmas usadas por la UI (ni por los futuros comandos de voz).
 */
export function useChats() {
  const [state, setState] = useState<ChatsState>(INITIAL_STATE);

  /** Simula el avance sent -> delivered -> read de un mensaje propio. */
  const simulateDelivery = useCallback((messageId: MessageId) => {
    const steps = [400, 1100, 2400];
    steps.forEach((ms) => {
      setTimeout(() => {
        setState((prev) => chatActions.advanceMessageStatus(prev, messageId));
      }, ms);
    });
  }, []);

  const openChat = useCallback((chatId: ChatId) => {
    setState((prev) => chatActions.openChat(prev, chatId));
  }, []);

  const sendTextMessage = useCallback(
    (chatId: ChatId, body: string, replyToMessageId: MessageId | null = null) => {
      if (!body.trim()) return;
      setState((prev) => {
        const result = chatActions.sendTextMessage(prev, chatId, body, replyToMessageId);
        simulateDelivery(result.message.id);
        return result.state;
      });
    },
    [simulateDelivery],
  );

  const sendVoiceNote = useCallback(
    (
      chatId: ChatId,
      durationSeconds: number,
      waveform: number[],
      replyToMessageId: MessageId | null = null,
    ) => {
      setState((prev) => {
        const result = chatActions.sendVoiceNote(
          prev,
          chatId,
          durationSeconds,
          waveform,
          replyToMessageId,
        );
        simulateDelivery(result.message.id);
        return result.state;
      });
    },
    [simulateDelivery],
  );

  const sendAttachment = useCallback(
    (chatId: ChatId, kind: "image" | "document", fileName: string, fileSizeBytes?: number) => {
      setState((prev) => {
        const result = chatActions.sendAttachmentMessage(
          prev,
          chatId,
          kind,
          fileName,
          fileSizeBytes,
        );
        simulateDelivery(result.message.id);
        return result.state;
      });
    },
    [simulateDelivery],
  );

  /** Comparte la ubicación actual (simulada). */
  const shareCurrentLocation = useCallback(
    (chatId: ChatId, replyToMessageId: MessageId | null = null) => {
      setState((prev) => {
        const result = chatActions.shareCurrentLocation(prev, chatId, replyToMessageId);
        simulateDelivery(result.message.id);
        return result.state;
      });
    },
    [simulateDelivery],
  );

  /** Inicia la ubicación en tiempo real por 15 min / 1 h / 8 h (simulada). */
  const startLiveLocation = useCallback(
    (chatId: ChatId, duration: chatActions.LiveLocationDuration) => {
      setState((prev) => {
        const result = chatActions.startLiveLocation(prev, chatId, duration);
        simulateDelivery(result.message.id);
        return result.state;
      });
    },
    [simulateDelivery],
  );

  /** Detiene la ubicación en vivo (botón "Detener" o contador en cero). */
  const stopLiveLocation = useCallback((messageId: MessageId) => {
    setState((prev) => chatActions.stopLiveLocation(prev, messageId));
  }, []);

  /** Responde a un estado: abre/crea el chat 1 a 1 y envía el mensaje citándolo. */
  const replyToStatus = useCallback(
    (authorId: UserId, displayName: string, body: string, statusReply: StatusReplyRef): ChatId => {
      let chatId = "" as ChatId;
      setState((prev) => {
        const opened = chatActions.startChatWithUser(prev, authorId, displayName);
        chatId = opened.chatId;
        const result = chatActions.sendStatusReply(opened.state, chatId, body, statusReply);
        simulateDelivery(result.message.id);
        return result.state;
      });
      return chatId;
    },
    [simulateDelivery],
  );

  const forwardMessage = useCallback((messageId: MessageId, targetChatId: ChatId) => {
    setState((prev) => chatActions.forwardMessage(prev, messageId, targetChatId));
  }, []);

  const editMessage = useCallback((messageId: MessageId, body: string) => {
    setState((prev) => chatActions.editMessage(prev, messageId, body));
  }, []);

  const deleteMessage = useCallback((messageId: MessageId) => {
    setState((prev) => chatActions.deleteMessage(prev, messageId));
  }, []);

  /** Alterna la reacción del usuario actual sobre un mensaje. */
  const toggleReaction = useCallback((messageId: MessageId, emoji: string) => {
    setState((prev) => chatActions.toggleReaction(prev, messageId, emoji));
  }, []);

  /** Quita la reacción propia de un mensaje. */
  const removeReaction = useCallback((messageId: MessageId) => {
    setState((prev) => chatActions.removeReaction(prev, messageId));
  }, []);

  /** Activa (con TTL) o desactiva los mensajes que desaparecen del chat. */
  const setDisappearingMessages = useCallback(
    (chatId: ChatId, ttlSeconds: DisappearingTtlSeconds | null) => {
      setState((prev) => chatActions.setDisappearingMessages(prev, chatId, ttlSeconds));
    },
    [],
  );

  /** Silencia con duración (8h / 1 semana / siempre). */
  const muteChat = useCallback((chatId: ChatId, duration: chatActions.MuteDuration) => {
    setState((prev) => chatActions.muteChat(prev, chatId, duration));
  }, []);

  const unmuteChat = useCallback((chatId: ChatId) => {
    setState((prev) => chatActions.unmuteChat(prev, chatId));
  }, []);

  /** Fija un chat; devuelve el aviso cuando ya hay el máximo permitido. */
  const pinChat = useCallback((chatId: ChatId): string | null => {
    let error: string | null = null;
    setState((prev) => {
      const result = chatActions.pinChat(prev, chatId);
      error = result.error;
      return result.state;
    });
    return error as string | null;
  }, []);

  const unpinChat = useCallback((chatId: ChatId) => {
    setState((prev) => chatActions.unpinChat(prev, chatId));
  }, []);

  const archiveChat = useCallback((chatId: ChatId) => {
    setState((prev) => chatActions.archiveChat(prev, chatId));
  }, []);

  const unarchiveChat = useCallback((chatId: ChatId) => {
    setState((prev) => chatActions.unarchiveChat(prev, chatId));
  }, []);

  const removeChat = useCallback((chatId: ChatId) => {
    setState((prev) => chatActions.deleteChat(prev, chatId));
  }, []);

  const startChatWithUser = useCallback((participantId: UserId, title: string): ChatId => {
    let chatId = "";
    setState((prev) => {
      const result = chatActions.startChatWithUser(prev, participantId, title);
      chatId = result.chatId;
      return result.state;
    });
    return chatId;
  }, []);

  const getMessages = useCallback(
    (chatId: ChatId) => chatActions.getChatMessages(state, chatId),
    [state],
  );

  /** Filtra la lista principal por nombre de chat. */
  const search = useCallback(
    (query: string) => chatActions.searchChats(state, query),
    [state],
  );

  /** Búsqueda global dentro del contenido de los mensajes, agrupada por chat. */
  const searchMessages = useCallback(
    (query: string) => chatActions.searchMessages(state, query),
    [state],
  );

  const archivedChats = useMemo(() => chatActions.getArchivedChats(state), [state]);

  const participants = useMemo(() => MOCK_PARTICIPANTS, []);

  /** Crea un grupo con el usuario actual como administrador. */
  const createGroup = useCallback(
    (input: { name: string; participantIds: UserId[]; avatarUrl?: string | null }) => {
      let chatId: ChatId | null = null;
      let error: string | null = null;
      setState((prev) => {
        const result = groupActions.createGroupChat(prev, input);
        chatId = result.chatId;
        error = result.error;
        return result.state;
      });
      return { chatId: chatId as ChatId | null, error: error as string | null };
    },
    [],
  );

  const renameGroup = useCallback((chatId: ChatId, name: string) => {
    setState((prev) => groupActions.renameGroup(prev, chatId, name));
  }, []);

  const setGroupAvatar = useCallback((chatId: ChatId, avatarUrl: string | null) => {
    setState((prev) => groupActions.setGroupAvatar(prev, chatId, avatarUrl));
  }, []);

  const addParticipants = useCallback((chatId: ChatId, participantIds: UserId[]) => {
    setState((prev) => groupActions.addParticipants(prev, chatId, participantIds));
  }, []);

  const removeParticipant = useCallback((chatId: ChatId, participantId: UserId) => {
    setState((prev) => groupActions.removeParticipant(prev, chatId, participantId));
  }, []);

  const leaveGroup = useCallback((chatId: ChatId) => {
    setState((prev) => groupActions.leaveGroup(prev, chatId));
  }, []);

  const deleteGroup = useCallback((chatId: ChatId) => {
    setState((prev) => groupActions.deleteGroup(prev, chatId));
  }, []);

  return {
    state,
    participants,
    openChat,
    sendTextMessage,
    sendVoiceNote,
    sendAttachment,
    shareCurrentLocation,
    startLiveLocation,
    stopLiveLocation,
    replyToStatus,
    forwardMessage,
    editMessage,
    deleteMessage,
    toggleReaction,
    removeReaction,
    setDisappearingMessages,
    muteChat,
    unmuteChat,
    pinChat,
    unpinChat,
    archiveChat,
    unarchiveChat,
    archivedChats,
    searchMessages,
    removeChat,
    startChatWithUser,
    getMessages,
    search,
    startCall: chatActions.startCall,
    createGroup,
    renameGroup,
    setGroupAvatar,
    addParticipants,
    removeParticipant,
    leaveGroup,
    deleteGroup,
  };
}

export type ChatsController = ReturnType<typeof useChats>;
