import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as chatActions from "@/lib/actions/chats";
import * as groupActions from "@/lib/actions/groups";
import * as profileActions from "@/lib/actions/profile";
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
import type { RealtimeChannel } from "@supabase/supabase-js";

const EMPTY_STATE: ChatsState = { chats: [], messages: [], participants: {} };

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
      // "Entregado" (dos chulos grises) no depende de tener el chat abierto,
      // solo de que mi app ya haya recibido el mensaje — así que se confirma
      // apenas termina la carga inicial, para todo lo que llegó mientras no
      // estaba conectado.
      const undeliveredFromOthers = loaded.messages
        .filter((message) => message.senderId !== CURRENT_USER_ID && message.status !== "read")
        .map((message) => message.id);
      if (undeliveredFromOthers.length > 0) {
        void chatActions.markMessagesDeliveredRemote(undeliveredFromOthers);
      }
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
          let applied = false;
          setState((prev) => {
            // Ya lo tengo (eco de mi propio insert, reconciliado en sendTextMessage).
            if (prev.messages.some((item) => item.id === message.id)) return prev;
            // No es un chat mío todavía (puede pasar si el chat llega por el
            // otro evento un instante después) — se ignora, el otro handler
            // se encarga de traerlo completo.
            if (!prev.chats.some((chat) => chat.id === message.chatId)) return prev;
            applied = true;
            return chatActions.applyIncomingMessage(prev, message);
          });
          // Confirma "entregado" apenas mi app recibe el mensaje en vivo —
          // igual que arriba, esto vive fuera del updater para no duplicar
          // el efecto de red si React lo reinvoca.
          if (applied && message.senderId !== CURRENT_USER_ID) {
            void chatActions.markMessagesDeliveredRemote([message.id]);
          }
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
            // Perfil real del otro participante (ADR-0029) — quien me
            // agregó puede no estar todavía en `participants` si nunca
            // habíamos chateado antes.
            const otherId = chat.participantIds.find((id) => id !== CURRENT_USER_ID);
            if (otherId) {
              chatActions.fetchParticipantProfile(otherId).then((profile) => {
                if (profile) setState((prev) => chatActions.mergeParticipant(prev, profile));
              });
            }
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
          // Esto es la confirmación (delivered/read) de OTRA persona sobre
          // UN MENSAJE MÍO — lo que yo mismo confirmo sobre mensajes ajenos
          // no debe tocar el estado de mis propias burbujas.
          if (row.user_id === CURRENT_USER_ID || !row.message_id) return;
          if (row.status !== "read" && row.status !== "delivered") return;
          const nextStatus = row.status;
          setState((prev) => ({
            ...prev,
            messages: prev.messages.map((message) => {
              if (message.id !== row.message_id || message.senderId !== CURRENT_USER_ID) {
                return message;
              }
              // No bajar de "read" a "delivered" si el evento llega
              // desordenado (mismo guard que ya tiene la función RPC).
              if (message.status === "read" && nextStatus === "delivered") return message;
              return { ...message, status: nextStatus };
            }),
          }));
        },
      )
      // Ubicación real (ADR-0025): la fila de `location_shares` puede llegar
      // un instante después del mensaje `type: "location"` que la referencia
      // (dos inserts separados, sin transacción entre ellas desde el
      // cliente) — INSERT le pone las coordenadas por primera vez; UPDATE
      // trae cada posición nueva de una ubicación en vivo. Misma función
      // pura para ambos casos, RLS ya filtra a "solo chats donde participo".
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "location_shares" },
        (payload) => {
          setState((prev) =>
            chatActions.applyLocationShareRow(prev, payload.new as chatActions.LocationShareRow),
          );
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "location_shares" },
        (payload) => {
          setState((prev) =>
            chatActions.applyLocationShareRow(prev, payload.new as chatActions.LocationShareRow),
          );
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  // Presencia real "en línea" (ADR-0029) — antes `participants[x].isOnline`
  // venía fijo en `true` desde MOCK_PARTICIPANTS/AppStore.tsx, sin importar
  // si esa persona tenía la app abierta o no. Un solo canal de Presence de
  // Supabase Realtime compartido por todos los usuarios; `sync` trae el
  // conjunto COMPLETO de quién está conectado ahora mismo, no un delta —
  // así que nunca se puede desincronizar por un evento perdido.
  useEffect(() => {
    const channel = supabase.channel("presence:online", {
      config: { presence: { key: CURRENT_USER_ID } },
    });
    channel
      .on("presence", { event: "sync" }, () => {
        const onlineUserIds = new Set(Object.keys(channel.presenceState()));
        setState((prev) => chatActions.applyOnlinePresence(prev, onlineUserIds));
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          void channel.track({ online_at: new Date().toISOString() });
        }
      });
    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  // "Visto por última vez" real (ADR-0029): se marca al entrar, cada ~2 min
  // mientras la pestaña está visible, y al pasar a segundo plano — mismo
  // espíritu de throttling que el resto del proyecto (ubicación cada ~20s,
  // ADR-0025), aquí con un intervalo mucho más largo porque no hace falta
  // más precisión para "visto hace X min/horas".
  useEffect(() => {
    void profileActions.touchLastSeen(CURRENT_USER_ID);
    const interval = setInterval(() => {
      if (document.visibilityState === "visible")
        void profileActions.touchLastSeen(CURRENT_USER_ID);
    }, 120_000);
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") void profileActions.touchLastSeen(CURRENT_USER_ID);
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  // "Escribiendo…" real (ADR-0029) — un canal de Broadcast por chat (nunca
  // se escribe en la base: es puramente efímero). Se abre uno por cada chat
  // en la lista y se cierra si el chat se archiva/borra o al desmontar.
  const typingChannelsRef = useRef(new Map<ChatId, RealtimeChannel>());
  const typingRevertTimersRef = useRef(new Map<ChatId, ReturnType<typeof setTimeout>>());
  const lastTypingSentRef = useRef(new Map<ChatId, number>());
  const chatIdsKey = useMemo(
    () =>
      state.chats
        .map((chat) => chat.id)
        .sort()
        .join(","),
    [state.chats],
  );

  useEffect(() => {
    const currentIds = new Set(chatIdsKey ? chatIdsKey.split(",") : []);
    for (const chatId of currentIds) {
      if (typingChannelsRef.current.has(chatId)) continue;
      const channel = supabase
        .channel(`chat-typing-${chatId}`)
        .on("broadcast", { event: "typing" }, (payload) => {
          const senderId = (payload["payload"] as { senderId?: string } | null)?.senderId;
          if (!senderId || senderId === CURRENT_USER_ID) return;
          setState((prev) => chatActions.setChatActivity(prev, chatId, "typing"));
          const existingTimer = typingRevertTimersRef.current.get(chatId);
          if (existingTimer) clearTimeout(existingTimer);
          typingRevertTimersRef.current.set(
            chatId,
            setTimeout(() => {
              setState((prev) => chatActions.setChatActivity(prev, chatId, "idle"));
            }, 4000),
          );
        })
        .subscribe();
      typingChannelsRef.current.set(chatId, channel);
    }
    for (const [chatId, channel] of typingChannelsRef.current) {
      if (currentIds.has(chatId)) continue;
      void supabase.removeChannel(channel);
      typingChannelsRef.current.delete(chatId);
      const timer = typingRevertTimersRef.current.get(chatId);
      if (timer) clearTimeout(timer);
      typingRevertTimersRef.current.delete(chatId);
    }
  }, [chatIdsKey]);

  // Limpieza total de canales/temporizadores de "escribiendo…" al desmontar
  // el hook (ej. cerrar sesión) — mismo cuidado que ya se aplica a los
  // watchers de GPS de ubicación en vivo, más abajo.
  useEffect(() => {
    const channels = typingChannelsRef.current;
    const timers = typingRevertTimersRef.current;
    return () => {
      channels.forEach((channel) => void supabase.removeChannel(channel));
      channels.clear();
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
    };
  }, []);

  /** Avisa (con throttle de ~2s) que estoy escribiendo en este chat — real, vía Broadcast (ADR-0029). */
  const notifyTyping = useCallback((chatId: ChatId) => {
    const channel = typingChannelsRef.current.get(chatId);
    if (!channel) return;
    const now = Date.now();
    const lastSent = lastTypingSentRef.current.get(chatId) ?? 0;
    if (now - lastSent < 2000) return;
    lastTypingSentRef.current.set(chatId, now);
    void channel.send({
      type: "broadcast",
      event: "typing",
      payload: { senderId: CURRENT_USER_ID },
    });
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

  /**
   * Sube el audio real a Storage y luego inserta el mensaje real — mismo
   * patrón de reconciliación que `reconcileSentMessage` (texto). Si la
   * subida falla, el mensaje optimista pasa a "failed" en vez de quedar
   * "sending" para siempre.
   */
  const reconcileSentVoiceNote = useCallback(
    async (
      tempId: MessageId,
      chatId: ChatId,
      durationSeconds: number,
      waveform: number[],
      blob: Blob,
      replyToMessageId: MessageId | null,
    ) => {
      const mediaPath = await chatActions.uploadVoiceNote(chatId, blob);
      const inserted = mediaPath
        ? await chatActions.insertVoiceMessage(
            chatId,
            CURRENT_USER_ID,
            mediaPath,
            durationSeconds,
            waveform,
            replyToMessageId,
          )
        : null;
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

  const sendVoiceNote = useCallback(
    (
      chatId: ChatId,
      durationSeconds: number,
      waveform: number[],
      blob: Blob,
      replyToMessageId: MessageId | null = null,
    ) => {
      const localUrl = URL.createObjectURL(blob);
      let tempId: MessageId | null = null;
      setState((prev) => {
        const result = chatActions.sendVoiceNote(
          prev,
          chatId,
          durationSeconds,
          waveform,
          localUrl,
          replyToMessageId,
        );
        tempId = result.message.id;
        return result.state;
      });
      if (tempId) {
        void reconcileSentVoiceNote(
          tempId,
          chatId,
          durationSeconds,
          waveform,
          blob,
          replyToMessageId,
        );
      }
    },
    [reconcileSentVoiceNote],
  );

  /**
   * Sube la foto/documento real a Storage y luego inserta el mensaje real —
   * mismo patrón de reconciliación que `reconcileSentVoiceNote`. Si la
   * subida falla, el mensaje optimista pasa a "failed" en vez de quedar
   * "sending" para siempre (ADR-0031).
   */
  const reconcileSentAttachment = useCallback(
    async (
      tempId: MessageId,
      chatId: ChatId,
      kind: "image" | "document",
      file: File,
      replyToMessageId: MessageId | null,
    ) => {
      const mediaPath = await chatActions.uploadChatMedia(chatId, file);
      const inserted = mediaPath
        ? await chatActions.insertAttachmentMessage(
            chatId,
            CURRENT_USER_ID,
            kind,
            mediaPath,
            file.name,
            file.size,
            replyToMessageId,
          )
        : null;
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

  const sendAttachment = useCallback(
    (
      chatId: ChatId,
      kind: "image" | "document",
      file: File,
      replyToMessageId: MessageId | null = null,
    ) => {
      const localUrl = URL.createObjectURL(file);
      let tempId: MessageId | null = null;
      setState((prev) => {
        const result = chatActions.sendAttachmentMessage(
          prev,
          chatId,
          kind,
          localUrl,
          file.name,
          file.size,
          replyToMessageId,
        );
        tempId = result.message.id;
        return result.state;
      });
      if (tempId) {
        void reconcileSentAttachment(tempId, chatId, kind, file, replyToMessageId);
      }
    },
    [reconcileSentAttachment],
  );

  /**
   * Ubicación real (ADR-0025) — sin simulación: `getRealCurrentPosition` pide
   * el GPS real del navegador y `reverseGeocodeAddress` llama al backend real
   * (Google Geocoding, ADR-0010). No hay burbuja optimista previa (a
   * diferencia de texto/voz) porque no hay nada que mostrar hasta tener la
   * posición real; el error de permiso/timeout se expone en `locationError`.
   */
  const [locationError, setLocationError] = useState<string | null>(null);
  /** watchPosition + temporizador de vencimiento por cada ubicación en vivo propia activa. */
  const liveTrackersRef = useRef(
    new Map<MessageId, { watchId: number; expiryTimer: ReturnType<typeof setTimeout> }>(),
  );

  const stopLiveLocationTracking = useCallback((messageId: MessageId) => {
    const tracker = liveTrackersRef.current.get(messageId);
    if (!tracker) return;
    if (typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.clearWatch(tracker.watchId);
    }
    clearTimeout(tracker.expiryTimer);
    liveTrackersRef.current.delete(messageId);
  }, []);

  /** Detiene la ubicación en vivo (botón "Detener" o vencimiento del temporizador). */
  const stopLiveLocation = useCallback(
    (messageId: MessageId) => {
      stopLiveLocationTracking(messageId);
      setState((prev) => chatActions.stopLiveLocation(prev, messageId));
      void chatActions.stopLiveLocationShareRemote(messageId);
    },
    [stopLiveLocationTracking],
  );

  /** Arranca `watchPosition` real; sube posición a Supabase cada ~20s (throttle) y se detiene sola al vencer la duración. */
  const startLiveLocationTracking = useCallback(
    (messageId: MessageId, durationSeconds: number) => {
      if (typeof navigator === "undefined" || !navigator.geolocation) return;
      let lastSentAt = 0;
      const watchId = navigator.geolocation.watchPosition(
        (position) => {
          const now = Date.now();
          if (now - lastSentAt < 20_000) return;
          lastSentAt = now;
          void chatActions.updateLiveLocationPosition(
            messageId,
            position.coords.latitude,
            position.coords.longitude,
          );
        },
        (err) => console.error("[useChats] watchPosition falló", err),
        { enableHighAccuracy: true, maximumAge: 10_000 },
      );
      const expiryTimer = setTimeout(() => stopLiveLocation(messageId), durationSeconds * 1000);
      liveTrackersRef.current.set(messageId, { watchId, expiryTimer });
    },
    [stopLiveLocation],
  );

  /** Comparte la ubicación actual real como tarjeta de mapa. */
  const shareCurrentLocation = useCallback(
    async (chatId: ChatId, replyToMessageId: MessageId | null = null) => {
      setLocationError(null);
      try {
        const position = await chatActions.getRealCurrentPosition();
        const address = await chatActions.reverseGeocodeAddress(
          position.latitude,
          position.longitude,
        );
        const inserted = await chatActions.insertLocationMessage(
          chatId,
          CURRENT_USER_ID,
          {
            latitude: position.latitude,
            longitude: position.longitude,
            addressLabel: address,
            isLive: false,
          },
          replyToMessageId,
        );
        if (!inserted) {
          setLocationError("No se pudo compartir tu ubicación. Intenta de nuevo.");
          return;
        }
        setState((prev) => chatActions.applyIncomingMessage(prev, inserted));
      } catch (err) {
        setLocationError(err instanceof Error ? err.message : "No se pudo obtener tu ubicación.");
      }
    },
    [],
  );

  /** Inicia la ubicación en tiempo real por 15 min / 1 h / 8 h — GPS real con actualizaciones periódicas reales. */
  const startLiveLocation = useCallback(
    async (chatId: ChatId, duration: chatActions.LiveLocationDuration) => {
      setLocationError(null);
      const option = chatActions.LIVE_LOCATION_OPTIONS.find((item) => item.value === duration);
      const seconds = option?.seconds ?? 15 * 60;
      try {
        const position = await chatActions.getRealCurrentPosition();
        const address = await chatActions.reverseGeocodeAddress(
          position.latitude,
          position.longitude,
        );
        const inserted = await chatActions.insertLocationMessage(chatId, CURRENT_USER_ID, {
          latitude: position.latitude,
          longitude: position.longitude,
          addressLabel: address,
          isLive: true,
          liveDurationSeconds: seconds,
        });
        if (!inserted) {
          setLocationError("No se pudo iniciar la ubicación en vivo. Intenta de nuevo.");
          return;
        }
        setState((prev) => chatActions.applyIncomingMessage(prev, inserted));
        startLiveLocationTracking(inserted.id, seconds);
      } catch (err) {
        setLocationError(err instanceof Error ? err.message : "No se pudo obtener tu ubicación.");
      }
    },
    [startLiveLocationTracking],
  );

  // Los watchers de ubicación en vivo no deben sobrevivir a un desmontaje
  // del hook (ej. cerrar sesión) — se limpian todos, igual que cualquier
  // efecto con recursos externos.
  useEffect(() => {
    const trackers = liveTrackersRef.current;
    return () => {
      trackers.forEach((tracker) => {
        if (typeof navigator !== "undefined" && navigator.geolocation) {
          navigator.geolocation.clearWatch(tracker.watchId);
        }
        clearTimeout(tracker.expiryTimer);
      });
      trackers.clear();
    };
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
        // Perfil real del nuevo participante (ADR-0029) — un chat recién
        // creado con un contacto todavía no tiene su fila en `participants`.
        chatActions.fetchParticipantProfile(participantId).then((profile) => {
          if (profile) setState((prev) => chatActions.mergeParticipant(prev, profile));
        });
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

  // Reales primero (ADR-0029), con MOCK_PARTICIPANTS solo como respaldo para
  // ids que no vienen de un chat real todavía (ej. autores de Estados, que
  // siguen siendo 100% simulados — no se toca esa demo en este slice).
  const participants = useMemo(
    () => ({ ...MOCK_PARTICIPANTS, ...state.participants }),
    [state.participants],
  );

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
    notifyTyping,
    openChat,
    sendTextMessage,
    sendVoiceNote,
    sendAttachment,
    shareCurrentLocation,
    startLiveLocation,
    stopLiveLocation,
    locationError,
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
