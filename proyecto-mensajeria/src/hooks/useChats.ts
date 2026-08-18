import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as chatActions from "@/lib/actions/chats";
import * as groupActions from "@/lib/actions/groups";
import type { ChatsState } from "@/lib/actions/chats";
import { CURRENT_USER_ID, MOCK_PARTICIPANTS } from "@/lib/domain/mock-data";
import { supabase } from "@/lib/supabase/client";
import type {
  ChatId,
  DisappearingTtlSeconds,
  Message,
  MessageId,
  StatusReplyRef,
  UserId,
} from "@/lib/domain/types";

const EMPTY_STATE: ChatsState = { chats: [], messages: [] };

/**
 * Controlador de la pestaña Chats: expone las acciones aisladas ya vinculadas
 * al estado local.
 *
 * Desde el 2026-08-18, chats 1-a-1 y mensajes de texto son reales
 * (Supabase + Realtime, ver `lib/actions/chats.ts`) — le llegan de verdad al
 * otro usuario. Todo lo demás (reacciones, notas de voz, fotos/documentos,
 * ubicación, grupos, silenciar/fijar/archivar, mensajes que desaparecen,
 * reenviar/editar/borrar) sigue siendo simulación local sobre el mismo
 * `ChatsState` — mismas firmas, para no romper la UI ni los futuros comandos
 * de voz cuando se conecten también.
 */
export function useChats() {
  const [state, setState] = useState<ChatsState>(EMPTY_STATE);
  const [isLoading, setLoading] = useState(true);
  // Candado en memoria para no crear dos chats 1-a-1 duplicados cuando
  // "Enviar mensaje" se toca dos veces seguidas (o Strict Mode reinvoca el
  // handler) antes de que la primera llamada a Supabase termine: sin esto,
  // las dos llamadas ven "no existe todavía" en el estado local y las dos
  // terminan creando su propio chat.
  const pendingChatByParticipant = useRef(new Map<UserId, Promise<ChatId>>());

  // Carga inicial de chats y mensajes reales del usuario.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    chatActions.fetchChatsAndMessages(CURRENT_USER_ID).then((loaded) => {
      if (cancelled) return;
      setState(loaded);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Realtime: mensajes nuevos, chats nuevos (alguien más me agregó) y
  // confirmaciones de lectura de mis propios mensajes.
  useEffect(() => {
    const channel = supabase
      .channel(`chats-realtime-${CURRENT_USER_ID}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const message = chatActions.mapRealtimeMessageRow(payload.new);
          setState((prev) => {
            // Ya lo tengo (eco de mi propio insert, reconciliado en sendTextMessage).
            if (prev.messages.some((item) => item.id === message.id)) return prev;
            // No es un chat mío todavía (puede pasar si el chat llega por el
            // otro evento un instante después) — se ignora, el otro handler
            // se encarga de traerlo completo.
            if (!prev.chats.some((chat) => chat.id === message.chatId)) return prev;
            return chatActions.applyIncomingMessage(prev, message);
          });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_participants",
          filter: `user_id=eq.${CURRENT_USER_ID}`,
        },
        (payload) => {
          const row = payload.new as { chat_id: string };
          setState((prev) => {
            if (prev.chats.some((chat) => chat.id === row.chat_id)) return prev;
            return prev;
          });
          chatActions.fetchSingleChat(row.chat_id, CURRENT_USER_ID).then((chat) => {
            if (!chat) return;
            setState((prev) =>
              prev.chats.some((item) => item.id === chat.id)
                ? prev
                : { ...prev, chats: [chat, ...prev.chats] },
            );
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "message_status" },
        (payload) => {
          const row = (payload.new ?? {}) as {
            message_id?: string;
            user_id?: string;
            status?: string;
          };
          if (row.status !== "read" || row.user_id === CURRENT_USER_ID || !row.message_id) return;
          setState((prev) => ({
            ...prev,
            messages: prev.messages.map((message) =>
              message.id === row.message_id && message.senderId === CURRENT_USER_ID
                ? { ...message, status: "read" }
                : message,
            ),
          }));
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

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
    // OJO: el updater de setState debe quedar puro. React (en desarrollo,
    // con Strict Mode) lo invoca dos veces para detectar impurezas — si el
    // efecto de red (marcar como leído en Supabase) viviera adentro, se
    // dispararía dos veces por cada apertura de chat. Por eso solo se
    // calculan los ids acá (lectura pura) y la llamada real a Supabase se
    // hace una sola vez, después, fuera del updater.
    let unreadIds: MessageId[] = [];
    setState((prev) => {
      // Los mensajes ajenos que aún no estén "read" se marcan como leídos de
      // verdad en Supabase (mensaje_status) — así el que los mandó ve el
      // check azul en su propio celular, en vivo.
      unreadIds = prev.messages
        .filter(
          (message) =>
            message.chatId === chatId &&
            message.senderId !== CURRENT_USER_ID &&
            message.status !== "read",
        )
        .map((message) => message.id);
      return chatActions.openChat(prev, chatId);
    });
    if (unreadIds.length > 0) {
      void chatActions.markChatReadRemote(chatId, CURRENT_USER_ID, unreadIds);
    }
  }, []);

  /**
   * Reconcilia el mensaje optimista local con la fila real ya guardada en
   * Supabase. El eco de Realtime del propio mensaje (ver la suscripción de
   * arriba) puede llegar antes de que esto termine — si ya está, solo se
   * quita el optimista en vez de duplicar la burbuja.
   */
  const reconcileSentMessage = useCallback(
    async (tempId: MessageId, chatId: ChatId, body: string, replyToMessageId: MessageId | null) => {
      const inserted = await chatActions.insertTextMessage(
        chatId,
        CURRENT_USER_ID,
        body,
        replyToMessageId,
      );
      setState((prev) => {
        if (!inserted) {
          return {
            ...prev,
            messages: prev.messages.map((message) =>
              message.id === tempId ? { ...message, status: "failed" as const } : message,
            ),
          };
        }
        const alreadyArrivedByRealtime = prev.messages.some(
          (message) => message.id === inserted.id && message.id !== tempId,
        );
        if (alreadyArrivedByRealtime) {
          return { ...prev, messages: prev.messages.filter((message) => message.id !== tempId) };
        }
        return {
          ...prev,
          messages: prev.messages.map((message) =>
            message.id === tempId
              ? ({ ...inserted, reactions: message.reactions } satisfies Message)
              : message,
          ),
        };
      });
    },
    [],
  );

  const sendTextMessage = useCallback(
    (chatId: ChatId, body: string, replyToMessageId: MessageId | null = null) => {
      if (!body.trim()) return;
      const trimmed = body.trim();
      // Mismo motivo que en openChat: el updater tiene que quedar puro. El
      // insert real en Supabase (reconcileSentMessage) se dispara una sola
      // vez, después de que setState termina, usando el id del mensaje
      // optimista que generó la última pasada del updater. Antes esto vivía
      // dentro del updater y, en desarrollo con Strict Mode, cada mensaje se
      // insertaba duplicado en la base de datos.
      let tempId: MessageId | null = null;
      setState((prev) => {
        const result = chatActions.sendTextMessage(prev, chatId, trimmed, replyToMessageId);
        tempId = result.message.id;
        return result.state;
      });
      if (tempId) {
        void reconcileSentMessage(tempId, chatId, trimmed, replyToMessageId);
      }
    },
    [reconcileSentMessage],
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

  /**
   * Abre (o crea de verdad en Supabase) el chat 1-a-1 con un usuario real ya
   * registrado — usado desde "Nuevo chat" y desde la ficha de un contacto.
   * Async porque crear un chat nuevo implica una vuelta a la base de datos;
   * si ya existe localmente, resuelve al toque sin tocar la red.
   */
  const startChatWithUser = useCallback(
    async (
      participantId: UserId,
      title: string,
      avatarUrl: string | null = null,
    ): Promise<ChatId> => {
      const existing = state.chats.find(
        (chat) => !chat.isGroup && chat.participantIds.includes(participantId),
      );
      if (existing) return existing.id;

      // Si ya hay una creación en curso para este mismo contacto, esperamos
      // esa misma promesa en vez de arrancar una segunda — así un doble tap
      // en "Enviar mensaje" no crea dos chats reales en Supabase.
      const pending = pendingChatByParticipant.current.get(participantId);
      if (pending) return pending;

      const creation = (async () => {
        const chat = await chatActions.findOrCreateIndividualChat(
          CURRENT_USER_ID,
          participantId,
          title,
          avatarUrl,
        );
        if (!chat) return "" as ChatId;
        setState((prev) =>
          prev.chats.some((item) => item.id === chat.id)
            ? prev
            : { ...prev, chats: [chat, ...prev.chats] },
        );
        return chat.id as ChatId;
      })().finally(() => {
        pendingChatByParticipant.current.delete(participantId);
      });

      pendingChatByParticipant.current.set(participantId, creation);
      return creation;
    },
    [state.chats],
  );

  const getMessages = useCallback(
    (chatId: ChatId) => chatActions.getChatMessages(state, chatId),
    [state],
  );

  /** Filtra la lista principal por nombre de chat. */
  const search = useCallback((query: string) => chatActions.searchChats(state, query), [state]);

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
    isLoading,
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
