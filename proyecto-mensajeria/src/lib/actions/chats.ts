/**
 * Acciones aisladas y reutilizables de mensajería.
 * Son funciones puras sobre el estado (`ChatsState`), de modo que las mismas
 * firmas se puedan invocar desde la UI, desde comandos de voz o, más adelante,
 * contra el backend real.
 */
import type {
  Chat,
  ChatId,
  DisappearingTtlSeconds,
  Message,
  MessageAttachment,
  MessageId,
  MessageKind,
  StatusReplyRef,
  UserId,
} from "@/lib/domain/types";
import { CURRENT_USER_ID } from "@/lib/domain/mock-data";

export interface ChatsState {
  chats: Chat[];
  messages: Message[];
}

/** Ventana de edición/eliminación de un mensaje propio (regla provisional). */
export const MESSAGE_EDIT_WINDOW_MS = 15 * 60 * 1000;

let sequence = 0;
function nextId(prefix: string): string {
  sequence += 1;
  return `${prefix}_${Date.now().toString(36)}_${sequence}`;
}

export function previewForMessage(message: Message): string {
  if (message.deletedAt) return "Mensaje eliminado";
  if (message.kind === "system") return message.body;
  switch (message.kind) {
    case "voice":
      return "Nota de voz";
    case "image":
      return "Foto";
    case "document":
      return message.attachment?.fileName ?? "Documento";
    case "location":
      return message.attachment?.liveUntil ? "Ubicación en tiempo real" : "Ubicación";
    default:
      return message.body;
  }
}

function touchChat(state: ChatsState, message: Message): ChatsState {
  return {
    ...state,
    chats: state.chats.map((chat) =>
      chat.id === message.chatId
        ? {
            ...chat,
            lastMessagePreview: previewForMessage(message),
            lastMessageAt: message.createdAt,
          }
        : chat,
    ),
  };
}

export function getChatMessages(state: ChatsState, chatId: ChatId): Message[] {
  return state.messages
    .filter((message) => message.chatId === chatId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Orden canónico: fijados primero (por momento de fijado) y luego actividad. */
export function getSortedChats(state: ChatsState): Chat[] {
  return [...state.chats].sort((a, b) => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
    if (a.isPinned && b.isPinned) return (a.pinnedAt ?? "").localeCompare(b.pinnedAt ?? "");
    return (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? "");
  });
}

/** Chats visibles en la lista principal (excluye archivados). */
export function getInboxChats(state: ChatsState): Chat[] {
  return getSortedChats(state).filter((chat) => !chat.archivedAt);
}

/** Chats archivados, del más reciente al más antiguo. */
export function getArchivedChats(state: ChatsState): Chat[] {
  return [...state.chats]
    .filter((chat) => Boolean(chat.archivedAt))
    .sort((a, b) => (b.archivedAt ?? "").localeCompare(a.archivedAt ?? ""));
}

/** Filtra la lista principal por nombre de chat. */
export function searchChats(state: ChatsState, query: string): Chat[] {
  const term = query.trim().toLowerCase();
  const chats = getInboxChats(state);
  if (!term) return chats;
  return chats.filter((chat) => chat.title.toLowerCase().includes(term));
}

/** Coincidencia de un mensaje con el fragmento de contexto alrededor del término. */
export interface MessageSearchHit {
  message: Message;
  snippet: string;
}

/** Resultados de búsqueda global agrupados por chat. */
export interface ChatSearchGroup {
  chat: Chat;
  hits: MessageSearchHit[];
}

/** Extrae un fragmento de contexto alrededor de la coincidencia. */
export function buildSnippet(body: string, term: string, radius = 32): string {
  const index = body.toLowerCase().indexOf(term.toLowerCase());
  if (index < 0) return body.slice(0, radius * 2);
  const start = Math.max(0, index - radius);
  const end = Math.min(body.length, index + term.length + radius);
  return `${start > 0 ? "…" : ""}${body.slice(start, end)}${end < body.length ? "…" : ""}`;
}

/**
 * Búsqueda global dentro del contenido de los mensajes de todos los chats
 * (incluidos los archivados), agrupada por conversación.
 */
export function searchMessages(state: ChatsState, query: string): ChatSearchGroup[] {
  const term = query.trim().toLowerCase();
  if (term.length < 2) return [];
  const groups: ChatSearchGroup[] = [];
  for (const chat of getSortedChats(state)) {
    const hits = state.messages
      .filter(
        (message) =>
          message.chatId === chat.id &&
          !message.deletedAt &&
          message.kind !== "system" &&
          (message.body.toLowerCase().includes(term) ||
            (message.attachment?.fileName ?? "").toLowerCase().includes(term)),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((message) => ({
        message,
        snippet: buildSnippet(message.body || (message.attachment?.fileName ?? ""), term),
      }));
    if (hits.length > 0) groups.push({ chat, hits });
  }
  return groups;
}

/** Abrir un chat: marca como leído. */
export function openChat(state: ChatsState, chatId: ChatId): ChatsState {
  return {
    ...state,
    chats: state.chats.map((chat) => (chat.id === chatId ? { ...chat, unreadCount: 0 } : chat)),
    messages: state.messages.map((message) =>
      message.chatId === chatId && message.senderId !== CURRENT_USER_ID
        ? { ...message, status: "read" }
        : message,
    ),
  };
}

export interface SendMessageInput {
  chatId: ChatId;
  kind: MessageKind;
  body?: string;
  attachment?: MessageAttachment | null;
  replyToMessageId?: MessageId | null;
  forwardedFromChatId?: ChatId | null;
  senderId?: UserId;
  disappearingTtlSeconds?: number | null;
  statusReply?: StatusReplyRef | null;
}

export function createMessage(input: SendMessageInput): Message {
  return {
    id: nextId("msg"),
    chatId: input.chatId,
    senderId: input.senderId ?? CURRENT_USER_ID,
    kind: input.kind,
    body: input.body ?? "",
    attachment: input.attachment ?? null,
    status: "sending",
    createdAt: new Date().toISOString(),
    editedAt: null,
    deletedAt: null,
    replyToMessageId: input.replyToMessageId ?? null,
    forwardedFromChatId: input.forwardedFromChatId ?? null,
    reactions: [],
    disappearingTtlSeconds: input.disappearingTtlSeconds ?? null,
    statusReply: input.statusReply ?? null,
  };
}

/** Responder a un estado: mensaje de texto en el chat 1 a 1 citando el estado. */
export function sendStatusReply(
  state: ChatsState,
  chatId: ChatId,
  body: string,
  statusReply: StatusReplyRef,
): { state: ChatsState; message: Message } {
  return sendMessage(state, { chatId, kind: "text", body: body.trim(), statusReply });
}

/** Enviar cualquier tipo de mensaje. */
export function sendMessage(
  state: ChatsState,
  input: SendMessageInput,
): { state: ChatsState; message: Message } {
  const chat = state.chats.find((item) => item.id === input.chatId);
  const message = createMessage({
    ...input,
    disappearingTtlSeconds: input.disappearingTtlSeconds ?? chat?.disappearingTtlSeconds ?? null,
  });
  const next = touchChat({ ...state, messages: [...state.messages, message] }, message);
  return { state: next, message };
}

export function sendTextMessage(
  state: ChatsState,
  chatId: ChatId,
  body: string,
  replyToMessageId: MessageId | null = null,
): { state: ChatsState; message: Message } {
  return sendMessage(state, { chatId, kind: "text", body: body.trim(), replyToMessageId });
}

/** Enviar nota de voz (grabación simulada en esta fase). */
export function sendVoiceNote(
  state: ChatsState,
  chatId: ChatId,
  durationSeconds: number,
  waveform: number[],
  replyToMessageId: MessageId | null = null,
): { state: ChatsState; message: Message } {
  return sendMessage(state, {
    chatId,
    kind: "voice",
    attachment: { kind: "voice", url: "#", durationSeconds, waveform },
    replyToMessageId,
  });
}

/** Enviar imagen o documento (selección simulada en esta fase). */
export function sendAttachmentMessage(
  state: ChatsState,
  chatId: ChatId,
  kind: "image" | "document",
  fileName: string,
  fileSizeBytes?: number,
): { state: ChatsState; message: Message } {
  const attachment: MessageAttachment =
    fileSizeBytes === undefined
      ? { kind, url: "#", fileName }
      : { kind, url: "#", fileName, fileSizeBytes };
  return sendMessage(state, { chatId, kind, attachment });
}

/** Reenviar un mensaje existente a otro chat. */
export function forwardMessage(
  state: ChatsState,
  messageId: MessageId,
  targetChatId: ChatId,
): ChatsState {
  const original = state.messages.find((message) => message.id === messageId);
  if (!original) return state;
  return sendMessage(state, {
    chatId: targetChatId,
    kind: original.kind,
    body: original.body,
    attachment: original.attachment,
    forwardedFromChatId: original.chatId,
  }).state;
}

/** Avanza el estado de entrega de un mensaje propio (simulación de red). */
export function advanceMessageStatus(state: ChatsState, messageId: MessageId): ChatsState {
  const order: Message["status"][] = ["sending", "sent", "delivered", "read"];
  return {
    ...state,
    messages: state.messages.map((message) => {
      if (message.id !== messageId) return message;
      const index = order.indexOf(message.status);
      if (index < 0 || index === order.length - 1) return message;
      return { ...message, status: order[index + 1] as Message["status"] };
    }),
  };
}

export function canModifyMessage(message: Message, now = Date.now()): boolean {
  if (message.senderId !== CURRENT_USER_ID || message.deletedAt) return false;
  return now - new Date(message.createdAt).getTime() <= MESSAGE_EDIT_WINDOW_MS;
}

export function editMessage(state: ChatsState, messageId: MessageId, body: string): ChatsState {
  return {
    ...state,
    messages: state.messages.map((message) =>
      message.id === messageId && canModifyMessage(message)
        ? { ...message, body: body.trim(), editedAt: new Date().toISOString() }
        : message,
    ),
  };
}

export function deleteMessage(state: ChatsState, messageId: MessageId): ChatsState {
  return {
    ...state,
    messages: state.messages.map((message) =>
      message.id === messageId && canModifyMessage(message)
        ? { ...message, deletedAt: new Date().toISOString(), body: "", attachment: null }
        : message,
    ),
  };
}

/* ------------------------------------------------------------------ */
/* Organización de la lista: silenciar, fijar y archivar               */
/* ------------------------------------------------------------------ */

/** Duraciones de silencio ofrecidas en la UI. */
export type MuteDuration = "8h" | "1w" | "always";

export const MUTE_OPTIONS: Array<{ value: MuteDuration; label: string }> = [
  { value: "8h", label: "8 horas" },
  { value: "1w", label: "1 semana" },
  { value: "always", label: "Siempre" },
];

/** Máximo de chats fijados simultáneamente. */
export const MAX_PINNED_CHATS = 3;

function updateChat(
  state: ChatsState,
  chatId: ChatId,
  update: (chat: Chat) => Chat,
): ChatsState {
  return {
    ...state,
    chats: state.chats.map((chat) => (chat.id === chatId ? update(chat) : chat)),
  };
}

function mutedUntilFor(duration: MuteDuration): string | null {
  if (duration === "always") return null;
  const ms = duration === "8h" ? 8 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
  return new Date(Date.now() + ms).toISOString();
}

/** Silencia un chat con la duración indicada. */
export function muteChat(state: ChatsState, chatId: ChatId, duration: MuteDuration): ChatsState {
  return updateChat(state, chatId, (chat) => ({
    ...chat,
    isMuted: true,
    mutedUntil: mutedUntilFor(duration),
  }));
}

/** Reactiva las notificaciones de un chat. */
export function unmuteChat(state: ChatsState, chatId: ChatId): ChatsState {
  return updateChat(state, chatId, (chat) => ({ ...chat, isMuted: false, mutedUntil: null }));
}

/** Etiqueta legible del estado de silencio. */
export function describeMute(chat: Chat): string {
  if (!chat.isMuted) return "Activado";
  if (!chat.mutedUntil) return "Silenciado siempre";
  return `Silenciado hasta ${new Date(chat.mutedUntil).toLocaleString("es-CO", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

export function countPinnedChats(state: ChatsState): number {
  return state.chats.filter((chat) => chat.isPinned).length;
}

/** Fija un chat; devuelve un error simple cuando ya hay 3 fijados. */
export function pinChat(
  state: ChatsState,
  chatId: ChatId,
): { state: ChatsState; error: string | null } {
  const chat = state.chats.find((item) => item.id === chatId);
  if (!chat) return { state, error: "El chat no existe." };
  if (chat.isPinned) return { state, error: null };
  if (countPinnedChats(state) >= MAX_PINNED_CHATS) {
    return {
      state,
      error: `Solo puedes fijar ${MAX_PINNED_CHATS} chats. Desfija uno primero.`,
    };
  }
  return {
    state: updateChat(state, chatId, (item) => ({
      ...item,
      isPinned: true,
      pinnedAt: new Date().toISOString(),
      archivedAt: null,
    })),
    error: null,
  };
}

export function unpinChat(state: ChatsState, chatId: ChatId): ChatsState {
  return updateChat(state, chatId, (chat) => ({ ...chat, isPinned: false, pinnedAt: null }));
}

/** Archiva un chat (se saca de la lista principal y se desfija). */
export function archiveChat(state: ChatsState, chatId: ChatId): ChatsState {
  return updateChat(state, chatId, (chat) => ({
    ...chat,
    archivedAt: new Date().toISOString(),
    isPinned: false,
    pinnedAt: null,
  }));
}

/** Devuelve un chat archivado a la lista principal. */
export function unarchiveChat(state: ChatsState, chatId: ChatId): ChatsState {
  return updateChat(state, chatId, (chat) => ({ ...chat, archivedAt: null }));
}

export function deleteChat(state: ChatsState, chatId: ChatId): ChatsState {
  return {
    chats: state.chats.filter((chat) => chat.id !== chatId),
    messages: state.messages.filter((message) => message.chatId !== chatId),
  };
}

/** Crea (o recupera) el chat 1-a-1 con un usuario. */
export function startChatWithUser(
  state: ChatsState,
  participantId: UserId,
  title: string,
): { state: ChatsState; chatId: ChatId } {
  const existing = state.chats.find(
    (chat) => !chat.isGroup && chat.participantIds.includes(participantId),
  );
  if (existing) return { state, chatId: existing.id };
  const chat: Chat = {
    id: nextId("chat"),
    participantIds: [CURRENT_USER_ID, participantId],
    title,
    avatarUrl: null,
    lastMessagePreview: "",
    lastMessageAt: new Date().toISOString(),
    unreadCount: 0,
    isMuted: false,
    isPinned: false,
    pinnedAt: null,
    mutedUntil: null,
    archivedAt: null,
    activity: "idle",
    isGroup: false,
    adminIds: [],
    disappearingTtlSeconds: null,
  };
  return { state: { ...state, chats: [chat, ...state.chats] }, chatId: chat.id };
}

/** Iniciar llamada: placeholder del marcador nativo (Capacitor en fase posterior). */
export function startCall(phoneNumber: string): { ok: boolean; dialUrl: string } {
  const dialUrl = `tel:${phoneNumber}`;
  if (typeof window !== "undefined") {
    console.info("[startCall] Simulando apertura del marcador nativo:", dialUrl);
  }
  return { ok: true, dialUrl };
}

/* ------------------------------------------------------------------ */
/* Reacciones a mensajes                                              */
/* ------------------------------------------------------------------ */

/** Barra rápida de reacciones (orden fijo, idéntico en 1-a-1 y grupos). */
export const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"] as const;

/** Selector completo (simulado): set curado de emojis frecuentes. */
export const EMOJI_PICKER_SET = [
  "👍", "👎", "❤️", "🔥", "🎉", "😂", "😊", "😍", "🤔", "😮",
  "😢", "😡", "🙏", "👏", "💪", "✅", "❌", "⏰", "📌", "💡",
  "🚀", "☕", "🍕", "⚽", "🌙", "☀️", "🤝", "👀", "🥳", "😴",
] as const;

/** Reacción del usuario indicado sobre un mensaje (null si no reaccionó). */
export function getUserReaction(message: Message, userId: UserId = CURRENT_USER_ID): string | null {
  return message.reactions.find((reaction) => reaction.userId === userId)?.emoji ?? null;
}

/** Agrupa las reacciones por emoji conservando el orden de aparición. */
export function summarizeReactions(
  message: Message,
): Array<{ emoji: string; count: number; userIds: UserId[] }> {
  const summary: Array<{ emoji: string; count: number; userIds: UserId[] }> = [];
  for (const reaction of message.reactions) {
    const entry = summary.find((item) => item.emoji === reaction.emoji);
    if (entry) {
      entry.count += 1;
      entry.userIds.push(reaction.userId);
    } else {
      summary.push({ emoji: reaction.emoji, count: 1, userIds: [reaction.userId] });
    }
  }
  return summary;
}

function replaceMessage(
  state: ChatsState,
  messageId: MessageId,
  update: (message: Message) => Message,
): ChatsState {
  return {
    ...state,
    messages: state.messages.map((message) =>
      message.id === messageId ? update(message) : message,
    ),
  };
}

/** Añade (o reemplaza) la reacción de un usuario a un mensaje. */
export function addReaction(
  state: ChatsState,
  messageId: MessageId,
  emoji: string,
  userId: UserId = CURRENT_USER_ID,
): ChatsState {
  return replaceMessage(state, messageId, (message) => ({
    ...message,
    reactions: [
      ...message.reactions.filter((reaction) => reaction.userId !== userId),
      { emoji, userId, createdAt: new Date().toISOString() },
    ],
  }));
}

/** Quita la reacción de un usuario. */
export function removeReaction(
  state: ChatsState,
  messageId: MessageId,
  userId: UserId = CURRENT_USER_ID,
): ChatsState {
  return replaceMessage(state, messageId, (message) => ({
    ...message,
    reactions: message.reactions.filter((reaction) => reaction.userId !== userId),
  }));
}

/** Alterna una reacción: si el usuario ya reaccionó con el mismo emoji, la quita. */
export function toggleReaction(
  state: ChatsState,
  messageId: MessageId,
  emoji: string,
  userId: UserId = CURRENT_USER_ID,
): ChatsState {
  const message = state.messages.find((item) => item.id === messageId);
  if (!message) return state;
  return getUserReaction(message, userId) === emoji
    ? removeReaction(state, messageId, userId)
    : addReaction(state, messageId, emoji, userId);
}

/* ------------------------------------------------------------------ */
/* Mensajes que desaparecen                                           */
/* ------------------------------------------------------------------ */

export const DISAPPEARING_OPTIONS: Array<{ label: string; ttlSeconds: DisappearingTtlSeconds }> = [
  { label: "24 horas", ttlSeconds: 86_400 },
  { label: "7 días", ttlSeconds: 604_800 },
  { label: "90 días", ttlSeconds: 7_776_000 },
];

export function describeDisappearingTtl(ttlSeconds: number | null): string {
  return DISAPPEARING_OPTIONS.find((option) => option.ttlSeconds === ttlSeconds)?.label ?? "Apagado";
}

/** Inserta un mensaje de sistema centrado en el hilo (sin burbuja). */
export function appendSystemMessage(state: ChatsState, chatId: ChatId, body: string): ChatsState {
  const message = createMessage({ chatId, kind: "system", body });
  return {
    ...state,
    messages: [...state.messages, { ...message, status: "read" }],
  };
}

/**
 * Activa o desactiva los mensajes que desaparecen en un chat y deja constancia
 * con un mensaje de sistema. `ttlSeconds = null` desactiva la opción.
 */
export function setDisappearingMessages(
  state: ChatsState,
  chatId: ChatId,
  ttlSeconds: DisappearingTtlSeconds | null,
): ChatsState {
  const chat = state.chats.find((item) => item.id === chatId);
  if (!chat || chat.disappearingTtlSeconds === ttlSeconds) return state;
  const next: ChatsState = {
    ...state,
    chats: state.chats.map((item) =>
      item.id === chatId ? { ...item, disappearingTtlSeconds: ttlSeconds } : item,
    ),
  };
  const duration = describeDisappearingTtl(ttlSeconds).toLowerCase();
  const body = !ttlSeconds
    ? "Desactivaste los mensajes que desaparecen. Los nuevos mensajes ya no desaparecerán."
    : chat.disappearingTtlSeconds
      ? `Cambiaste la duración de los mensajes que desaparecen a ${duration}.`
      : `Activaste los mensajes que desaparecen. Los nuevos mensajes desaparecerán después de ${duration}.`;
  return appendSystemMessage(next, chatId, body);
}

/* ------------------------------------------------------------------ */
/* Ubicación: puntual y en tiempo real                                 */
/* ------------------------------------------------------------------ */

/** Duraciones ofrecidas al compartir ubicación en tiempo real. */
export type LiveLocationDuration = "15m" | "1h" | "8h";

export const LIVE_LOCATION_OPTIONS: Array<{
  value: LiveLocationDuration;
  label: string;
  seconds: number;
}> = [
  { value: "15m", label: "15 minutos", seconds: 15 * 60 },
  { value: "1h", label: "1 hora", seconds: 60 * 60 },
  { value: "8h", label: "8 horas", seconds: 8 * 60 * 60 },
];

/**
 * Ubicación de ejemplo.
 * TODO: reemplazar por la lectura real del GPS del dispositivo (Capacitor
 * Geolocation) y por geocodificación inversa para la dirección.
 */
export const MOCK_CURRENT_LOCATION = {
  latitude: 4.6533,
  longitude: -74.0836,
  address: "Cra. 13 #85-32, Chapinero, Bogotá",
};

/**
 * Deep link a Google Maps (§10.5: abrir la app nativa de mapas con la
 * ubicación/ruta lista en vez de construir mapas propios).
 */
export function googleMapsUrl(latitude: number, longitude: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
}

/** Abre Google Maps con la ubicación del mensaje. Simulado: solo abre la URL. */
export function openLocationInMaps(message: Message): void {
  const { latitude, longitude } = message.attachment ?? {};
  if (latitude === undefined || longitude === undefined) return;
  // TODO: usar el plugin nativo de Capacitor para forzar la app de Google Maps.
  if (typeof window !== "undefined") {
    window.open(googleMapsUrl(latitude, longitude), "_blank", "noopener,noreferrer");
  }
}

/** Comparte la ubicación actual como tarjeta de mapa (simulada). */
export function shareCurrentLocation(
  state: ChatsState,
  chatId: ChatId,
  replyToMessageId: MessageId | null = null,
): { state: ChatsState; message: Message } {
  return sendMessage(state, {
    chatId,
    kind: "location",
    body: MOCK_CURRENT_LOCATION.address,
    attachment: {
      kind: "location",
      url: googleMapsUrl(MOCK_CURRENT_LOCATION.latitude, MOCK_CURRENT_LOCATION.longitude),
      ...MOCK_CURRENT_LOCATION,
      liveUntil: null,
      liveEndedAt: null,
    },
    replyToMessageId,
  });
}

/** Inicia la ubicación en tiempo real por una duración dada (simulada). */
export function startLiveLocation(
  state: ChatsState,
  chatId: ChatId,
  duration: LiveLocationDuration,
): { state: ChatsState; message: Message } {
  const option = LIVE_LOCATION_OPTIONS.find((item) => item.value === duration);
  const seconds = option?.seconds ?? 15 * 60;
  return sendMessage(state, {
    chatId,
    kind: "location",
    body: MOCK_CURRENT_LOCATION.address,
    attachment: {
      kind: "location",
      url: googleMapsUrl(MOCK_CURRENT_LOCATION.latitude, MOCK_CURRENT_LOCATION.longitude),
      ...MOCK_CURRENT_LOCATION,
      liveUntil: new Date(Date.now() + seconds * 1000).toISOString(),
      liveEndedAt: null,
    },
  });
}

/** Detiene la ubicación en vivo de un mensaje (por botón o al llegar a cero). */
export function stopLiveLocation(state: ChatsState, messageId: MessageId): ChatsState {
  return {
    ...state,
    messages: state.messages.map((message) =>
      message.id === messageId && message.attachment?.liveUntil
        ? {
            ...message,
            attachment: { ...message.attachment, liveEndedAt: new Date().toISOString() },
          }
        : message,
    ),
  };
}

/** true si el mensaje es una ubicación en vivo aún vigente. */
export function isLiveLocationActive(message: Message, now = Date.now()): boolean {
  const attachment = message.attachment;
  if (!attachment?.liveUntil || attachment.liveEndedAt) return false;
  return new Date(attachment.liveUntil).getTime() > now;
}

/** Ubicación en vivo propia y vigente de un chat (para el banner superior). */
export function getActiveLiveLocation(
  state: ChatsState,
  chatId: ChatId,
  now = Date.now(),
): Message | null {
  return (
    getChatMessages(state, chatId)
      .filter(
        (message) =>
          message.senderId === CURRENT_USER_ID &&
          !message.deletedAt &&
          isLiveLocationActive(message, now),
      )
      .at(-1) ?? null
  );
}

/** Contador regresivo simulado, ej. "12:04" restantes. */
export function formatLiveRemaining(message: Message, now = Date.now()): string {
  const liveUntil = message.attachment?.liveUntil;
  if (!liveUntil) return "";
  const remaining = Math.max(0, new Date(liveUntil).getTime() - now);
  const totalMinutes = Math.floor(remaining / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const seconds = Math.floor((remaining % 60000) / 1000);
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")} h`
    : `${minutes}:${String(seconds).padStart(2, "0")}`;
}
