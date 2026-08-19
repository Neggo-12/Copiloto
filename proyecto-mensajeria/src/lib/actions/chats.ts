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
import { supabase } from "@/lib/supabase/client";
import { backend } from "@/lib/backend/client";

export interface ChatsState {
  chats: Chat[];
  messages: Message[];
}

/* ------------------------------------------------------------------ */
/* Backend real: contactos, chats 1-a-1, texto (2026-08-18), notas de voz */
/* (ADR-0024) y ubicación puntual/en vivo (ADR-0025)                     */
/*                                                                      */
/* Lo de aquí abajo sí habla con Supabase (tablas chats/chat_participants/ */
/* messages/message_status/location_shares, bucket voice-notes) y es lo  */
/* único que de verdad le llega al otro usuario en vivo. El resto del    */
/* archivo (reacciones, fotos/documentos, grupos, silenciar/fijar/       */
/* archivar, mensajes que desaparecen, reenviar/editar/borrar) sigue      */
/* siendo simulación local sobre `ChatsState` — no se sincroniza todavía. */
/* Ver TECHNICAL_DEBT.md para el detalle de qué falta y por qué se dejó   */
/* así. */
/* ------------------------------------------------------------------ */

interface ChatRow {
  id: string;
  type: "individual" | "group";
  name: string | null;
  photo_url: string | null;
  disappearing_duration_seconds: number | null;
  created_by: string;
  created_at: string;
}

interface ChatParticipantRow {
  chat_id: string;
  user_id: string;
  role: "member" | "admin";
  is_pinned: boolean;
  pinned_at: string | null;
  is_muted: boolean;
  muted_until: string | null;
  is_archived: boolean;
  last_read_at: string | null;
  joined_at: string;
}

/** Fila real de `location_shares` — 1 a 1 con un mensaje `kind: "location"` (ver ADR-0025). */
export interface LocationShareRow {
  message_id?: string;
  latitude: number;
  longitude: number;
  address_label: string | null;
  is_live: boolean;
  live_duration_minutes: number | null;
  live_expires_at: string | null;
  stopped_at: string | null;
}

interface MessageRow {
  id: string;
  chat_id: string;
  sender_id: string;
  type: MessageKind;
  content: string | null;
  media_url: string | null;
  media_file_name: string | null;
  media_file_size_bytes: number | null;
  media_duration_seconds: number | null;
  waveform: number[] | null;
  reply_to_id: string | null;
  forwarded_from_chat_id: string | null;
  reply_to_status_id: string | null;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  expires_at: string | null;
  /** Embed de PostgREST vía FK (`location_shares.message_id -> messages.id`) — solo presente en fetches directos, no en el payload crudo de Realtime. */
  location_shares?: LocationShareRow | LocationShareRow[] | null;
}

const CHAT_COLUMNS =
  "id, type, name, photo_url, disappearing_duration_seconds, created_by, created_at";
const PARTICIPANT_COLUMNS =
  "chat_id, user_id, role, is_pinned, pinned_at, is_muted, muted_until, is_archived, last_read_at, joined_at";
const MESSAGE_COLUMNS =
  "id, chat_id, sender_id, type, content, media_url, media_file_name, media_file_size_bytes, media_duration_seconds, waveform, reply_to_id, forwarded_from_chat_id, reply_to_status_id, created_at, edited_at, deleted_at, expires_at, location_shares(latitude, longitude, address_label, is_live, live_duration_minutes, live_expires_at, stopped_at)";

function mapMessageRow(row: MessageRow): Message {
  // Con `exactOptionalPropertyTypes` no se puede asignar `undefined` a una
  // propiedad opcional — hay que omitir la clave por completo cuando el dato
  // no existe, en vez de ponerle `?? undefined`.
  let attachment: MessageAttachment | null = null;
  if (row.type !== "text" && row.type !== "system") {
    attachment = {
      kind: row.type,
      url: row.media_url ?? "#",
      ...(row.media_file_name !== null ? { fileName: row.media_file_name } : {}),
      ...(row.media_file_size_bytes !== null ? { fileSizeBytes: row.media_file_size_bytes } : {}),
      ...(row.media_duration_seconds !== null
        ? { durationSeconds: row.media_duration_seconds }
        : {}),
      ...(row.waveform !== null ? { waveform: row.waveform } : {}),
    };
    if (row.type === "location") {
      // PostgREST embed vía FK — objeto en fetches directos (relación 1 a 1,
      // `message_id` es PK de `location_shares`); ausente en el payload
      // crudo de Realtime (se completa aparte, ver `applyLocationShareRow`
      // en useChats.ts).
      const share = Array.isArray(row.location_shares)
        ? (row.location_shares[0] ?? null)
        : (row.location_shares ?? null);
      if (share) {
        attachment = {
          ...attachment,
          url: googleMapsUrl(share.latitude, share.longitude),
          latitude: share.latitude,
          longitude: share.longitude,
          ...(share.address_label !== null ? { address: share.address_label } : {}),
          liveUntil: share.is_live ? share.live_expires_at : null,
          liveEndedAt: share.stopped_at,
        };
      }
    }
  }
  return {
    id: row.id,
    chatId: row.chat_id,
    senderId: row.sender_id,
    kind: row.type,
    body: row.content ?? "",
    attachment,
    // Valor de partida al insertarse o al llegar por Realtime; para
    // mensajes ya existentes, `fetchChatsAndMessages` lo pisa enseguida con
    // el estado real vía `hydrateMessageStatuses`. El resto de las
    // transiciones (delivered/read) llegan en vivo por la suscripción a
    // `message_status` en useChats.ts.
    status: "sent",
    createdAt: row.created_at,
    editedAt: row.edited_at,
    deletedAt: row.deleted_at,
    replyToMessageId: row.reply_to_id,
    forwardedFromChatId: row.forwarded_from_chat_id,
    reactions: [],
    disappearingTtlSeconds: null,
    statusReply: null,
  };
}

function mapChatRow(
  row: ChatRow,
  participants: ChatParticipantRow[],
  myUserId: UserId,
  title: string,
  avatarUrl: string | null,
): Chat {
  const mine = participants.find((item) => item.user_id === myUserId);
  return {
    id: row.id,
    participantIds: participants.map((item) => item.user_id),
    title,
    avatarUrl,
    lastMessagePreview: "",
    lastMessageAt: row.created_at,
    unreadCount: 0,
    isMuted: mine?.is_muted ?? false,
    mutedUntil: mine?.muted_until ?? null,
    isPinned: mine?.is_pinned ?? false,
    pinnedAt: mine?.pinned_at ?? null,
    // La tabla solo guarda un booleano `is_archived`, no un timestamp real de
    // cuándo se archivó — se usa `created_at` del chat como valor estable
    // para poder ordenar; el orden exacto entre varios archivados puede no
    // ser perfecto, pero es un detalle menor.
    archivedAt: mine?.is_archived ? row.created_at : null,
    activity: "idle",
    isGroup: row.type === "group",
    adminIds: participants.filter((item) => item.role === "admin").map((item) => item.user_id),
    disappearingTtlSeconds: null,
  };
}

/**
 * Rellena `status` con el estado real de entrega/lectura (antes quedaba
 * siempre fijo en "sent", sin importar lo que hubiera pasado de verdad, así
 * que al volver a entrar a un chat los chulos se "olvidaban").
 *
 * - Mensajes míos: mira las filas de `message_status` de LOS OTROS
 *   participantes → "read" (chulos azules) > "delivered" (dos chulos
 *   grises) > "sent" (un chulo, nadie lo ha confirmado todavía).
 * - Mensajes ajenos: solo importa si YO ya lo marqué "read" — se usa para
 *   el conteo de no leídos, no se muestran chulos sobre burbujas ajenas.
 */
async function hydrateMessageStatuses(messages: Message[], userId: UserId): Promise<void> {
  const messageIds = messages.map((message) => message.id);
  if (messageIds.length === 0) return;
  const { data: statusRows } = await supabase
    .from("message_status")
    .select("message_id, user_id, status")
    .in("message_id", messageIds);

  const rowsByMessage = new Map<string, { user_id: string; status: string }[]>();
  for (const row of (statusRows ?? []) as {
    message_id: string;
    user_id: string;
    status: string;
  }[]) {
    const list = rowsByMessage.get(row.message_id) ?? [];
    list.push({ user_id: row.user_id, status: row.status });
    rowsByMessage.set(row.message_id, list);
  }

  for (const message of messages) {
    const rows = rowsByMessage.get(message.id) ?? [];
    if (message.senderId === userId) {
      const others = rows.filter((row) => row.user_id !== userId);
      message.status = others.some((row) => row.status === "read")
        ? "read"
        : others.some((row) => row.status === "delivered")
          ? "delivered"
          : "sent";
    } else {
      const mine = rows.find((row) => row.user_id === userId);
      message.status = mine?.status === "read" ? "read" : "delivered";
    }
  }
}

/** Marca (de verdad, en Supabase) que estos mensajes ya llegaron a mi dispositivo. */
export async function markMessagesDeliveredRemote(messageIds: MessageId[]): Promise<void> {
  if (messageIds.length === 0) return;
  const { error } = await supabase.rpc("mark_messages_delivered", { p_message_ids: messageIds });
  if (error) {
    console.error("[chats] markMessagesDeliveredRemote: no se pudo marcar como entregado", error);
  }
}

/** Carga todos los chats reales del usuario junto con sus mensajes. */
export async function fetchChatsAndMessages(
  userId: UserId,
): Promise<{ chats: Chat[]; messages: Message[] }> {
  const { data: myParticipantRows } = await supabase
    .from("chat_participants")
    .select(PARTICIPANT_COLUMNS)
    .eq("user_id", userId);
  const chatIds = (myParticipantRows ?? []).map((row) => row.chat_id);
  if (chatIds.length === 0) return { chats: [], messages: [] };

  const [{ data: chatRows }, { data: allParticipantRows }, { data: messageRows }] =
    await Promise.all([
      supabase.from("chats").select(CHAT_COLUMNS).in("id", chatIds),
      supabase.from("chat_participants").select(PARTICIPANT_COLUMNS).in("chat_id", chatIds),
      supabase
        .from("messages")
        .select(MESSAGE_COLUMNS)
        .in("chat_id", chatIds)
        .order("created_at", { ascending: true }),
    ]);

  const participantUserIds = Array.from(
    new Set((allParticipantRows ?? []).map((row) => row.user_id)),
  );
  const { data: profileRows } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url")
    .in("id", participantUserIds.length > 0 ? participantUserIds : [userId]);
  const profileById = new Map((profileRows ?? []).map((row) => [row.id, row]));

  const participantsByChat = new Map<string, ChatParticipantRow[]>();
  for (const row of (allParticipantRows ?? []) as ChatParticipantRow[]) {
    const list = participantsByChat.get(row.chat_id) ?? [];
    list.push(row);
    participantsByChat.set(row.chat_id, list);
  }

  const chats: Chat[] = ((chatRows ?? []) as ChatRow[]).map((row) => {
    const participants = participantsByChat.get(row.id) ?? [];
    const other = participants.find((item) => item.user_id !== userId);
    const otherProfile = other ? profileById.get(other.user_id) : undefined;
    const title =
      row.type === "group" ? (row.name ?? "Grupo") : (otherProfile?.display_name ?? "Usuario");
    const avatarUrl = row.type === "group" ? row.photo_url : (otherProfile?.avatar_url ?? null);
    return mapChatRow(row, participants, userId, title, avatarUrl);
  });

  const messages: Message[] = ((messageRows ?? []) as MessageRow[]).map(mapMessageRow);
  await hydrateMessageStatuses(messages, userId);

  const myParticipantByChat = new Map(
    ((myParticipantRows ?? []) as ChatParticipantRow[]).map((row) => [row.chat_id, row]),
  );
  for (const chat of chats) {
    const chatMessages = messages.filter((message) => message.chatId === chat.id);
    const last = chatMessages.at(-1);
    if (last) {
      chat.lastMessagePreview = previewForMessage(last);
      chat.lastMessageAt = last.createdAt;
    }
    const lastReadAt = myParticipantByChat.get(chat.id)?.last_read_at;
    chat.unreadCount = chatMessages.filter(
      (message) => message.senderId !== userId && (!lastReadAt || message.createdAt > lastReadAt),
    ).length;
  }

  return { chats, messages };
}

/** Trae un chat puntual (usado cuando llega por Realtime uno nuevo del que no era parte antes). */
export async function fetchSingleChat(chatId: ChatId, userId: UserId): Promise<Chat | null> {
  const { data: chatRow } = await supabase
    .from("chats")
    .select(CHAT_COLUMNS)
    .eq("id", chatId)
    .maybeSingle();
  if (!chatRow) return null;
  const typedChatRow = chatRow as ChatRow;
  const { data: participantRows } = await supabase
    .from("chat_participants")
    .select(PARTICIPANT_COLUMNS)
    .eq("chat_id", chatId);
  const participants = (participantRows ?? []) as ChatParticipantRow[];
  const other = participants.find((item) => item.user_id !== userId);

  let title = typedChatRow.name ?? "Grupo";
  let avatarUrl = typedChatRow.photo_url;
  if (typedChatRow.type === "individual" && other) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name, avatar_url")
      .eq("id", other.user_id)
      .maybeSingle();
    title = profile?.display_name ?? "Usuario";
    avatarUrl = profile?.avatar_url ?? null;
  }
  return mapChatRow(typedChatRow, participants, userId, title, avatarUrl);
}

/** Convierte la fila cruda que manda Supabase Realtime en un `Message` del dominio. */
export function mapRealtimeMessageRow(row: unknown): Message {
  return mapMessageRow(row as MessageRow);
}

/** Inserta un mensaje ya llegado por Realtime en el estado local (mismo camino que uno propio). */
export function applyIncomingMessage(state: ChatsState, message: Message): ChatsState {
  return touchChat({ ...state, messages: [...state.messages, message] }, message);
}

/** Inserta un mensaje de texto real; le llega al otro usuario por Realtime. */
export async function insertTextMessage(
  chatId: ChatId,
  senderId: UserId,
  body: string,
  replyToMessageId: MessageId | null = null,
): Promise<Message | null> {
  const { data, error } = await supabase
    .from("messages")
    .insert({
      chat_id: chatId,
      sender_id: senderId,
      type: "text",
      content: body,
      reply_to_id: replyToMessageId,
    })
    .select(MESSAGE_COLUMNS)
    .single();
  if (error || !data) return null;
  return mapMessageRow(data as MessageRow);
}

/**
 * Sube el audio real de una nota de voz al bucket privado `voice-notes`
 * (política RLS ya existente desde el esquema original — carpeta
 * `chat/{chatId}/...`, solo participantes del chat, ver ADR-0001/ADR-0024).
 * Devuelve la RUTA guardada (no una URL pública — el bucket es privado; la
 * reproducción resuelve una URL firmada bajo demanda, ver `VoiceNotePlayer`).
 */
export async function uploadVoiceNote(chatId: ChatId, blob: Blob): Promise<string | null> {
  const extension = blob.type.includes("mp4") ? "m4a" : "webm";
  const path = `chat/${chatId}/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage
    .from("voice-notes")
    .upload(path, blob, { contentType: blob.type || "audio/webm" });
  if (error) {
    console.error("[chats] uploadVoiceNote: no se pudo subir el audio", error);
    return null;
  }
  return path;
}

/** Inserta un mensaje de nota de voz real (audio ya subido a Storage); le llega al otro usuario por Realtime. */
export async function insertVoiceMessage(
  chatId: ChatId,
  senderId: UserId,
  mediaPath: string,
  durationSeconds: number,
  waveform: number[],
  replyToMessageId: MessageId | null = null,
): Promise<Message | null> {
  const { data, error } = await supabase
    .from("messages")
    .insert({
      chat_id: chatId,
      sender_id: senderId,
      type: "voice",
      media_url: mediaPath,
      media_duration_seconds: durationSeconds,
      waveform,
      reply_to_id: replyToMessageId,
    })
    .select(MESSAGE_COLUMNS)
    .single();
  if (error || !data) return null;
  return mapMessageRow(data as MessageRow);
}

/* ------------------------------------------------------------------ */
/* Ubicación real: puntual y en tiempo real (ADR-0025)                  */
/* ------------------------------------------------------------------ */

/** Posición real del GPS del dispositivo — nunca simulada. */
export function getRealCurrentPosition(
  options?: PositionOptions,
): Promise<{ latitude: number; longitude: number }> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("Este navegador no soporta geolocalización."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
      (error) => {
        reject(
          new Error(
            error.code === error.PERMISSION_DENIED
              ? "Necesitas darle permiso de ubicación a la app."
              : "No se pudo obtener tu ubicación.",
          ),
        );
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 5_000, ...options },
    );
  });
}

/**
 * Dirección legible vía el backend real (`GET /navigation/reverse-geocode`,
 * Google Geocoding API — ADR-0010). Devuelve `null` si falla; no bloquea el
 * envío de la ubicación, solo se pierde la etiqueta de texto.
 */
export async function reverseGeocodeAddress(
  latitude: number,
  longitude: number,
): Promise<string | null> {
  try {
    const result = await backend.get<{ formattedAddress: string } | null>(
      `/navigation/reverse-geocode?lat=${latitude}&lng=${longitude}`,
    );
    return result?.formattedAddress ?? null;
  } catch (err) {
    console.error("[chats] reverseGeocodeAddress: no se pudo geocodificar", err);
    return null;
  }
}

/**
 * Inserta un mensaje de ubicación real: fila en `messages` (`type:
 * "location"`) + fila hermana en `location_shares` (coordenadas —
 * ADR-0001/ADR-0025). Si falla la segunda escritura, el mensaje se marca
 * borrado (`messages_update_own_window`, RLS ya existente) en vez de quedar
 * un mensaje de ubicación sin coordenadas — no hay hard-delete permitido por
 * RLS.
 */
export async function insertLocationMessage(
  chatId: ChatId,
  senderId: UserId,
  input: {
    latitude: number;
    longitude: number;
    addressLabel: string | null;
    isLive: boolean;
    liveDurationSeconds?: number;
  },
  replyToMessageId: MessageId | null = null,
): Promise<Message | null> {
  const { data: messageRow, error: messageError } = await supabase
    .from("messages")
    .insert({
      chat_id: chatId,
      sender_id: senderId,
      type: "location",
      content: input.addressLabel,
      reply_to_id: replyToMessageId,
    })
    .select(MESSAGE_COLUMNS)
    .single();
  if (messageError || !messageRow) {
    console.error("[chats] insertLocationMessage: no se pudo crear el mensaje", messageError);
    return null;
  }

  const liveExpiresAt =
    input.isLive && input.liveDurationSeconds
      ? new Date(Date.now() + input.liveDurationSeconds * 1000).toISOString()
      : null;
  const { error: shareError } = await supabase.from("location_shares").insert({
    message_id: messageRow.id,
    latitude: input.latitude,
    longitude: input.longitude,
    address_label: input.addressLabel,
    is_live: input.isLive,
    live_duration_minutes:
      input.isLive && input.liveDurationSeconds ? Math.round(input.liveDurationSeconds / 60) : null,
    live_expires_at: liveExpiresAt,
  });
  if (shareError) {
    console.error("[chats] insertLocationMessage: no se pudo guardar la ubicación", shareError);
    await supabase
      .from("messages")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", messageRow.id);
    return null;
  }

  return {
    ...mapMessageRow(messageRow as MessageRow),
    attachment: {
      kind: "location",
      url: googleMapsUrl(input.latitude, input.longitude),
      latitude: input.latitude,
      longitude: input.longitude,
      ...(input.addressLabel !== null ? { address: input.addressLabel } : {}),
      liveUntil: liveExpiresAt,
      liveEndedAt: null,
    },
  };
}

/** Sube una posición nueva de una ubicación en vivo ya iniciada (solo el emisor puede, ver RLS `location_shares_update_sender`). */
export async function updateLiveLocationPosition(
  messageId: MessageId,
  latitude: number,
  longitude: number,
): Promise<boolean> {
  const { error } = await supabase
    .from("location_shares")
    .update({ latitude, longitude })
    .eq("message_id", messageId);
  if (error) {
    console.error("[chats] updateLiveLocationPosition: no se pudo actualizar la posición", error);
    return false;
  }
  return true;
}

/** Marca una ubicación en vivo como detenida (botón "Detener" o vencimiento del temporizador local). */
export async function stopLiveLocationShareRemote(messageId: MessageId): Promise<boolean> {
  const { error } = await supabase
    .from("location_shares")
    .update({ stopped_at: new Date().toISOString() })
    .eq("message_id", messageId);
  if (error) {
    console.error("[chats] stopLiveLocationShareRemote: no se pudo detener", error);
    return false;
  }
  return true;
}

/**
 * Aplica una fila de `location_shares` (llegada por Realtime, INSERT o
 * UPDATE) al mensaje correspondiente ya en estado local — así llegan tanto
 * la ubicación puntual del otro usuario (que llega un instante después de su
 * mensaje) como cada actualización de una ubicación en vivo.
 */
export function applyLocationShareRow(state: ChatsState, row: LocationShareRow): ChatsState {
  if (!row.message_id) return state;
  return {
    ...state,
    messages: state.messages.map((message) => {
      if (message.id !== row.message_id || message.kind !== "location") return message;
      return {
        ...message,
        attachment: {
          kind: "location",
          url: googleMapsUrl(row.latitude, row.longitude),
          latitude: row.latitude,
          longitude: row.longitude,
          ...(row.address_label !== null ? { address: row.address_label } : {}),
          liveUntil: row.is_live ? row.live_expires_at : null,
          liveEndedAt: row.stopped_at,
        },
      };
    }),
  };
}

/** Busca (o crea) el chat 1-a-1 real con otro usuario ya registrado. */
export async function findOrCreateIndividualChat(
  userId: UserId,
  participantId: UserId,
  participantDisplayName: string,
  participantAvatarUrl: string | null = null,
): Promise<Chat | null> {
  const { data: myRows } = await supabase
    .from("chat_participants")
    .select("chat_id")
    .eq("user_id", userId);
  const myChatIds = (myRows ?? []).map((row) => row.chat_id);

  if (myChatIds.length > 0) {
    const { data: sharedRows } = await supabase
      .from("chat_participants")
      .select("chat_id")
      .eq("user_id", participantId)
      .in("chat_id", myChatIds);
    for (const shared of sharedRows ?? []) {
      const { data: chatRow } = await supabase
        .from("chats")
        .select(CHAT_COLUMNS)
        .eq("id", shared.chat_id)
        .eq("type", "individual")
        .maybeSingle();
      if (chatRow) {
        const { data: participantRows } = await supabase
          .from("chat_participants")
          .select(PARTICIPANT_COLUMNS)
          .eq("chat_id", chatRow.id);
        return mapChatRow(
          chatRow as ChatRow,
          (participantRows ?? []) as ChatParticipantRow[],
          userId,
          participantDisplayName,
          participantAvatarUrl,
        );
      }
    }
  }

  // Generamos el id en el cliente y creamos el chat SIN pedir `.select()`
  // (Prefer: return=minimal). Si encadenáramos `.select().single()` aquí,
  // Postgres tendría que evaluar la política de lectura (`is_chat_participant`)
  // sobre la fila recién insertada, y esa política falla porque el registro
  // de `chat_participants` del usuario todavía no existe — eso causaba el
  // 403 al enviar el primer mensaje a un contacto nuevo.
  const newChatId = crypto.randomUUID();
  const { error: chatError } = await supabase
    .from("chats")
    .insert({ id: newChatId, type: "individual", created_by: userId });
  if (chatError) return null;

  // OJO: aunque insertemos las dos filas de participantes en la MISMA
  // sentencia, Postgres NO deja que el RETURNING de una fila "vea" a su
  // fila hermana insertada en ese mismo INSERT para efectos de RLS — la
  // política de lectura (`is_chat_participant`) sigue sin encontrar mi
  // propio registro en ese instante. Por eso insertamos también sin
  // `.select()` aquí (esto seguía dando 403 con la versión anterior).
  const { error: participantsError } = await supabase.from("chat_participants").insert([
    { chat_id: newChatId, user_id: userId, role: "admin" },
    { chat_id: newChatId, user_id: participantId, role: "member" },
  ]);
  if (participantsError) return null;

  // Recién ahora, en una consulta NUEVA y aparte, mi fila de participante
  // ya quedó confirmada (misma transacción implícita, visible entre
  // sentencias) — así que tanto releer `chats` como leer `chat_participants`
  // pasan sus políticas de RLS sin problema.
  const [
    { data: newChat, error: refetchError },
    { data: participantRows, error: participantsFetchError },
  ] = await Promise.all([
    supabase.from("chats").select(CHAT_COLUMNS).eq("id", newChatId).single(),
    supabase.from("chat_participants").select(PARTICIPANT_COLUMNS).eq("chat_id", newChatId),
  ]);
  if (refetchError || !newChat) return null;
  if (participantsFetchError || !participantRows) return null;

  return mapChatRow(
    newChat as ChatRow,
    participantRows as ChatParticipantRow[],
    userId,
    participantDisplayName,
    participantAvatarUrl,
  );
}

/**
 * Marca como leídos (en la base de datos real) los mensajes del otro
 * participante al abrir el chat — así el que los envió ve el check azul.
 */
export async function markChatReadRemote(
  chatId: ChatId,
  userId: UserId,
  unreadMessageIds: MessageId[],
): Promise<void> {
  const { error: lastReadError } = await supabase
    .from("chat_participants")
    .update({ last_read_at: new Date().toISOString() })
    .eq("chat_id", chatId)
    .eq("user_id", userId);
  // Antes esto se ignoraba en silencio: si fallaba, el estado local ya
  // había quedado "leído" de forma optimista (chatActions.openChat), así que
  // nunca se reintentaba ni se notaba — quedaba "leído" para mí pero
  // "entregado" para siempre del lado de quien lo mandó. Con esto al menos
  // queda en la consola para poder diagnosticarlo si vuelve a pasar.
  if (lastReadError) {
    console.error("[chats] markChatReadRemote: no se pudo actualizar last_read_at", lastReadError);
  }
  if (unreadMessageIds.length === 0) return;
  const { error: statusError } = await supabase.from("message_status").upsert(
    unreadMessageIds.map((messageId) => ({
      message_id: messageId,
      user_id: userId,
      status: "read" as const,
    })),
    { onConflict: "message_id,user_id" },
  );
  if (statusError) {
    console.error("[chats] markChatReadRemote: no se pudo marcar como leído", statusError);
  }
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
            // Solo suma al contador de "no leídos" si el mensaje es del otro
            // lado — los propios (optimistas o ya confirmados) no cuentan.
            // Antes esto se quedaba siempre en lo que trajo la carga inicial:
            // un mensaje nuevo que llegaba en vivo nunca prendía el badge en
            // la lista de chats.
            unreadCount:
              message.senderId !== CURRENT_USER_ID ? chat.unreadCount + 1 : chat.unreadCount,
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

/**
 * Burbuja optimista de nota de voz — `localUrl` es un `URL.createObjectURL`
 * del audio real recién grabado (reproducible de inmediato, antes de que
 * termine de subirse a Storage). Ver `reconcileSentVoiceNote` en
 * `useChats.ts` para el envío real (ADR-0024).
 */
export function sendVoiceNote(
  state: ChatsState,
  chatId: ChatId,
  durationSeconds: number,
  waveform: number[],
  localUrl: string,
  replyToMessageId: MessageId | null = null,
): { state: ChatsState; message: Message } {
  return sendMessage(state, {
    chatId,
    kind: "voice",
    attachment: { kind: "voice", url: localUrl, durationSeconds, waveform },
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

function updateChat(state: ChatsState, chatId: ChatId, update: (chat: Chat) => Chat): ChatsState {
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
  "👍",
  "👎",
  "❤️",
  "🔥",
  "🎉",
  "😂",
  "😊",
  "😍",
  "🤔",
  "😮",
  "😢",
  "😡",
  "🙏",
  "👏",
  "💪",
  "✅",
  "❌",
  "⏰",
  "📌",
  "💡",
  "🚀",
  "☕",
  "🍕",
  "⚽",
  "🌙",
  "☀️",
  "🤝",
  "👀",
  "🥳",
  "😴",
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
  return (
    DISAPPEARING_OPTIONS.find((option) => option.ttlSeconds === ttlSeconds)?.label ?? "Apagado"
  );
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
 * Deep link a Google Maps (§10.5: abrir la app nativa de mapas con la
 * ubicación/ruta lista en vez de construir mapas propios).
 */
export function googleMapsUrl(latitude: number, longitude: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
}

/** Abre Google Maps con la ubicación real del mensaje. */
export function openLocationInMaps(message: Message): void {
  const { latitude, longitude } = message.attachment ?? {};
  if (latitude === undefined || longitude === undefined) return;
  // TODO: usar el plugin nativo de Capacitor para forzar la app de Google Maps.
  if (typeof window !== "undefined") {
    window.open(googleMapsUrl(latitude, longitude), "_blank", "noopener,noreferrer");
  }
}

/**
 * Actualiza localmente el estado optimista al detener una ubicación en vivo
 * (botón "Detener" o vencimiento del temporizador); el efecto real
 * (`stopped_at` en Postgres) lo hace `stopLiveLocationShareRemote`, llamado
 * aparte desde `useChats.ts` — ver ADR-0025.
 */
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

/** Contador regresivo real, ej. "12:04" restantes. */
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
