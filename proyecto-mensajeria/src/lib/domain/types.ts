/**
 * Modelo de datos canónico de la app de mensajería.
 * Estos nombres y estructuras se reutilizarán al conectar el backend real,
 * por lo que NO deben renombrarse a la ligera.
 */

export type UserId = string;
export type ChatId = string;
export type MessageId = string;
export type NoteId = string;
export type ContactId = string;
export type DeviceId = string;
export type StatusId = string;

/** Perfil de usuario (propio o de un tercero). */
export interface UserProfile {
  id: UserId;
  displayName: string;
  about: string;
  avatarUrl: string | null;
  phoneNumber: string; // E.164, ej: +573001112233
  phoneCountryCode: string; // ISO-3166 alpha-2, ej: CO
  email: string | null;
  isPhoneVerified: boolean;
  isEmailVerified: boolean;
  lastSeenAt: string | null; // ISO 8601
  isOnline: boolean;
  createdAt: string; // ISO 8601
}

export type MessageDeliveryStatus = "sending" | "sent" | "delivered" | "read" | "failed";
export type MessageKind = "text" | "voice" | "image" | "document" | "location" | "system";

/** Reacción de un usuario a un mensaje (un emoji por usuario y mensaje). */
export interface MessageReaction {
  emoji: string;
  userId: UserId;
  createdAt: string; // ISO 8601
}

/** Duraciones soportadas por los mensajes que desaparecen (en segundos). */
export type DisappearingTtlSeconds = 86400 | 604800 | 7776000;

export interface MessageAttachment {
  kind: Exclude<MessageKind, "text">;
  url: string;
  fileName?: string;
  fileSizeBytes?: number;
  durationSeconds?: number; // notas de voz
  waveform?: number[]; // amplitudes normalizadas 0..1
  /** Ubicación compartida (simulada en esta fase). */
  latitude?: number;
  longitude?: number;
  address?: string;
  /** Fin de la ubicación en vivo (ISO 8601); null/undefined si es puntual. */
  liveUntil?: string | null;
  /** Momento en que se detuvo la ubicación en vivo (ISO 8601). */
  liveEndedAt?: string | null;
}

export interface Message {
  id: MessageId;
  chatId: ChatId;
  senderId: UserId;
  kind: MessageKind;
  body: string;
  attachment: MessageAttachment | null;
  status: MessageDeliveryStatus;
  createdAt: string; // ISO 8601
  editedAt: string | null;
  deletedAt: string | null;
  replyToMessageId: MessageId | null;
  forwardedFromChatId: ChatId | null;
  /** Reacciones al mensaje; una por usuario. */
  reactions: MessageReaction[];
  /**
   * TTL heredado del chat al momento de enviar el mensaje; null cuando los
   * mensajes que desaparecen estaban desactivados. En esta fase solo se usa
   * para mostrar el ícono de temporizador.
   */
  disappearingTtlSeconds: number | null;
  /** Estado/historia citado cuando el mensaje es una respuesta a un estado. */
  statusReply?: StatusReplyRef | null;
}

/** Referencia mínima al estado citado en una respuesta. */
export interface StatusReplyRef {
  statusId: StatusId;
  authorId: UserId;
  preview: string;
}

export type StatusKind = "text" | "media";

/** Alcance de publicación de un estado. */
export type StatusAudienceMode = "all" | "except" | "only";

export interface StatusAudience {
  mode: StatusAudienceMode;
  /** Contactos excluidos ("except") o incluidos ("only"); vacío en "all". */
  contactIds: ContactId[];
}

/** Registro de quién vio un estado y cuándo. */
export interface StatusView {
  viewerId: UserId;
  viewedAt: string; // ISO 8601
}

/** Estado/historia: expira 24 h después de publicarse. */
export interface StatusUpdate {
  id: StatusId;
  authorId: UserId;
  kind: StatusKind;
  /** Texto del estado o leyenda de la foto/video. */
  body: string;
  /** Color de fondo (hex de la paleta de marca) en estados de texto. */
  backgroundColor: string | null;
  /** Media simulada en esta fase (foto/video). */
  mediaUrl: string | null;
  audience: StatusAudience;
  createdAt: string; // ISO 8601
  expiresAt: string; // ISO 8601
  views: StatusView[];
}

export type ChatActivity = "idle" | "typing" | "recording_audio";

export interface Chat {
  id: ChatId;
  participantIds: UserId[];
  title: string;
  avatarUrl: string | null;
  lastMessagePreview: string;
  lastMessageAt: string | null;
  unreadCount: number;
  isMuted: boolean;
  /** Fin del silencio temporal (ISO 8601); null cuando es "siempre" o no está silenciado. */
  mutedUntil: string | null;
  isPinned: boolean;
  /** Momento en que se fijó el chat (ISO 8601); ordena los fijados. */
  pinnedAt: string | null;
  /** Fecha de archivado; null cuando el chat está en la lista principal. */
  archivedAt: string | null;
  activity: ChatActivity;
  /** true cuando el chat es grupal (varios participantes y administración). */
  isGroup: boolean;
  /** Administradores del grupo; vacío en chats 1 a 1. */
  adminIds: UserId[];
  /** TTL de mensajes que desaparecen; null cuando está desactivado. */
  disappearingTtlSeconds: DisappearingTtlSeconds | null;
}

export type NoteKind = "text" | "voice";

/** Estado de una nota marcada como tarea. */
export type TaskStatus = "pending" | "done";

export interface Note {
  id: NoteId;
  ownerId: UserId;
  kind: NoteKind;
  title: string | null;
  body: string;
  attachment: MessageAttachment | null; // nota de voz
  reminderAt: string | null; // opcional por diseño: una libreta, no una lista de alarmas
  createdAt: string;
  updatedAt: string;
  /** Fecha de archivado; null si la nota sigue activa en la libreta. */
  archivedAt: string | null;
  /** Marca opcional: la nota funciona además como tarea. */
  isTask: boolean;
  /** Estado de la tarea; null cuando la nota no está marcada como tarea. */
  taskStatus: TaskStatus | null;
  /** Fecha de cumplimiento; null si está pendiente o no es tarea. */
  completedAt: string | null;
}

export interface Contact {
  id: ContactId;
  ownerId: UserId;
  displayName: string;
  phoneNumber: string;
  avatarUrl: string | null;
  /** true si el contacto ya usa la app (tiene cuenta). */
  hasAppAccount: boolean;
  linkedUserId: UserId | null;
  source: "device" | "manual";
  isInvited: boolean;
}

export interface ConnectedDevice {
  id: DeviceId;
  deviceName: string;
  platform: "ios" | "android" | "web";
  lastActiveAt: string;
  isCurrentDevice: boolean;
}

/** Permisos nativos solicitados durante el onboarding. */
export type PermissionKey = "contacts" | "notifications" | "microphone" | "camera";
export type PermissionStatus = "unknown" | "granted" | "denied";

export interface PrivacySettings {
  profilePhotoVisibility: PrivacyAudience;
  aboutVisibility: PrivacyAudience;
  lastSeenVisibility: PrivacyAudience;
}
export type PrivacyAudience = "everyone" | "contacts" | "nobody";

export interface NotificationSettings {
  messages: boolean;
  voiceNotes: boolean;
  noteReminders: boolean;
  calls: boolean;
}

export interface SecuritySettings {
  twoStepVerificationEnabled: boolean;
}

/** Pasos del flujo de entrada previo a la navegación principal. */
export type OnboardingStep =
  "welcome" | "phone" | "otp" | "email" | "email_verify" | "profile" | "permissions" | "done";
