/**
 * Acciones aisladas y reutilizables de chats grupales.
 * Operan sobre el mismo `ChatsState` de chats.ts (un grupo es un Chat con
 * `isGroup: true` y `adminIds`), de modo que las firmas se reutilicen al
 * conectar el backend real.
 */
import type { ChatsState } from "@/lib/actions/chats";
import { CURRENT_USER_ID } from "@/lib/domain/mock-data";
import type { Chat, ChatId, UserId, UserProfile } from "@/lib/domain/types";

export const GROUP_NAME_MAX_LENGTH = 60;
export const GROUP_MIN_PARTICIPANTS = 1;

let sequence = 0;
function nextGroupId(): string {
  sequence += 1;
  return `chat_group_${Date.now().toString(36)}_${sequence}`;
}

export function isValidGroupName(name: string): boolean {
  return name.trim().length >= 2;
}

export function findGroup(state: ChatsState, chatId: ChatId): Chat | null {
  return state.chats.find((chat) => chat.id === chatId && chat.isGroup) ?? null;
}

/** ¿El usuario puede administrar el grupo (renombrar, agregar/quitar, eliminar)? */
export function canManageGroup(chat: Chat, userId: UserId = CURRENT_USER_ID): boolean {
  return chat.isGroup && chat.adminIds.includes(userId);
}

export function isGroupAdmin(chat: Chat, userId: UserId): boolean {
  return chat.adminIds.includes(userId);
}

/** Miembros distintos del usuario actual. */
export function getOtherParticipantIds(
  chat: Chat,
  userId: UserId = CURRENT_USER_ID,
): UserId[] {
  return chat.participantIds.filter((id) => id !== userId);
}

/** Resumen tipo "Ricardo, Alejandra y 3 más". */
export function describeParticipants(
  chat: Chat,
  participants: Record<string, UserProfile>,
  userId: UserId = CURRENT_USER_ID,
): string {
  const names = getOtherParticipantIds(chat, userId).map(
    (id) => participants[id]?.displayName.split(" ")[0] ?? "Participante",
  );
  if (names.length === 0) return "Solo tú";
  if (names.length <= 2) return `Tú, ${names.join(" y ")}`;
  return `${names[0]}, ${names[1]} y ${names.length - 2} más`;
}

/** Crea un grupo con el usuario actual como administrador. */
export function createGroupChat(
  state: ChatsState,
  input: { name: string; participantIds: UserId[]; avatarUrl?: string | null },
): { state: ChatsState; chatId: ChatId | null; error: string | null } {
  const name = input.name.trim().slice(0, GROUP_NAME_MAX_LENGTH);
  if (!isValidGroupName(name)) {
    return { state, chatId: null, error: "Ponle un nombre al grupo (mínimo 2 letras)." };
  }
  const members = Array.from(new Set(input.participantIds.filter((id) => id !== CURRENT_USER_ID)));
  if (members.length < GROUP_MIN_PARTICIPANTS) {
    return { state, chatId: null, error: "Elige al menos un participante." };
  }
  const chat: Chat = {
    id: nextGroupId(),
    participantIds: [CURRENT_USER_ID, ...members],
    title: name,
    avatarUrl: input.avatarUrl ?? null,
    lastMessagePreview: "Grupo creado",
    lastMessageAt: new Date().toISOString(),
    unreadCount: 0,
    isMuted: false,
    isPinned: false,
    pinnedAt: null,
    mutedUntil: null,
    archivedAt: null,
    activity: "idle",
    isGroup: true,
    adminIds: [CURRENT_USER_ID],
    disappearingTtlSeconds: null,
  };
  return {
    state: { ...state, chats: [chat, ...state.chats] },
    chatId: chat.id,
    error: null,
  };
}

function patchGroup(
  state: ChatsState,
  chatId: ChatId,
  patch: (chat: Chat) => Chat,
): ChatsState {
  return {
    ...state,
    chats: state.chats.map((chat) => (chat.id === chatId && chat.isGroup ? patch(chat) : chat)),
  };
}

/** Renombrar el grupo (solo administrador). */
export function renameGroup(state: ChatsState, chatId: ChatId, name: string): ChatsState {
  const group = findGroup(state, chatId);
  if (!group || !canManageGroup(group) || !isValidGroupName(name)) return state;
  return patchGroup(state, chatId, (chat) => ({
    ...chat,
    title: name.trim().slice(0, GROUP_NAME_MAX_LENGTH),
  }));
}

/** Cambiar la foto del grupo (solo administrador). */
export function setGroupAvatar(
  state: ChatsState,
  chatId: ChatId,
  avatarUrl: string | null,
): ChatsState {
  const group = findGroup(state, chatId);
  if (!group || !canManageGroup(group)) return state;
  return patchGroup(state, chatId, (chat) => ({ ...chat, avatarUrl }));
}

/** Agregar participantes (solo administrador). */
export function addParticipants(
  state: ChatsState,
  chatId: ChatId,
  participantIds: UserId[],
): ChatsState {
  const group = findGroup(state, chatId);
  if (!group || !canManageGroup(group)) return state;
  return patchGroup(state, chatId, (chat) => ({
    ...chat,
    participantIds: Array.from(new Set([...chat.participantIds, ...participantIds])),
  }));
}

/** Quitar un participante (solo administrador, nunca a sí mismo). */
export function removeParticipant(
  state: ChatsState,
  chatId: ChatId,
  participantId: UserId,
): ChatsState {
  const group = findGroup(state, chatId);
  if (!group || !canManageGroup(group) || participantId === CURRENT_USER_ID) return state;
  return patchGroup(state, chatId, (chat) => ({
    ...chat,
    participantIds: chat.participantIds.filter((id) => id !== participantId),
    adminIds: chat.adminIds.filter((id) => id !== participantId),
  }));
}

/** Salir del grupo: lo quita de la lista local del usuario. */
export function leaveGroup(state: ChatsState, chatId: ChatId): ChatsState {
  const group = findGroup(state, chatId);
  if (!group) return state;
  return {
    chats: state.chats.filter((chat) => chat.id !== chatId),
    messages: state.messages.filter((message) => message.chatId !== chatId),
  };
}

/** Eliminar el grupo (solo administrador). */
export function deleteGroup(state: ChatsState, chatId: ChatId): ChatsState {
  const group = findGroup(state, chatId);
  if (!group || !canManageGroup(group)) return state;
  return {
    chats: state.chats.filter((chat) => chat.id !== chatId),
    messages: state.messages.filter((message) => message.chatId !== chatId),
  };
}
