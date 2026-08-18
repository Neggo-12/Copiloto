/**
 * Acciones de Estados/Historias. Cada acción es pura y aislada para que al
 * conectar el backend real solo cambie la implementación interna, no las
 * firmas que consume la UI.
 */
import { CURRENT_USER_ID } from "@/lib/domain/mock-data";
import type {
  ContactId,
  StatusAudience,
  StatusAudienceMode,
  StatusId,
  StatusKind,
  StatusReplyRef,
  StatusUpdate,
  UserId,
} from "@/lib/domain/types";

export interface StatusesState {
  statuses: StatusUpdate[];
}

/** Los estados viven 24 horas (simulado con el reloj del cliente). */
export const STATUS_TTL_MS = 24 * 60 * 60 * 1000;

/** Fondos de marca disponibles para los estados de texto. */
export const STATUS_BACKGROUNDS: Array<{ id: string; label: string; color: string }> = [
  { id: "violet", label: "Violeta", color: "#5B4FE5" },
  { id: "indigo", label: "Índigo", color: "#241B5C" },
  { id: "amber", label: "Ámbar", color: "#F5A623" },
  { id: "slate", label: "Grafito", color: "#111827" },
  { id: "teal", label: "Verde", color: "#0F766E" },
];

/** Duración por defecto de cada segmento del visor (ms). */
export const STATUS_SEGMENT_MS = 5000;

export const DEFAULT_STATUS_AUDIENCE: StatusAudience = { mode: "all", contactIds: [] };

function nextId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

/** true mientras el estado no haya expirado (24 h). */
export function isStatusActive(status: StatusUpdate, now = Date.now()): boolean {
  return new Date(status.expiresAt).getTime() > now;
}

/** Estados vigentes ordenados del más antiguo al más nuevo. */
export function getActiveStatuses(state: StatusesState, now = Date.now()): StatusUpdate[] {
  return state.statuses
    .filter((status) => isStatusActive(status, now))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** true si el usuario ya vio el estado. */
export function hasViewed(status: StatusUpdate, viewerId: UserId = CURRENT_USER_ID): boolean {
  return status.views.some((view) => view.viewerId === viewerId);
}

/** Entrada de la fila horizontal: una burbuja por autor. */
export interface StatusFeedEntry {
  authorId: UserId;
  statuses: StatusUpdate[];
  /** true cuando queda al menos un estado sin ver (anillo con degradado). */
  hasUnseen: boolean;
  lastCreatedAt: string;
}

/** Estados propios vigentes. */
export function getMyStatuses(state: StatusesState, now = Date.now()): StatusUpdate[] {
  return getActiveStatuses(state, now).filter((status) => status.authorId === CURRENT_USER_ID);
}

/**
 * Agrupa los estados de otros contactos por autor. Los autores con estados
 * sin ver quedan primero, luego por actividad más reciente.
 */
export function getStatusFeed(
  state: StatusesState,
  viewerId: UserId = CURRENT_USER_ID,
  now = Date.now(),
): StatusFeedEntry[] {
  const byAuthor = new Map<UserId, StatusUpdate[]>();
  for (const status of getActiveStatuses(state, now)) {
    if (status.authorId === CURRENT_USER_ID) continue;
    byAuthor.set(status.authorId, [...(byAuthor.get(status.authorId) ?? []), status]);
  }

  return [...byAuthor.entries()]
    .map(([authorId, statuses]) => ({
      authorId,
      statuses,
      hasUnseen: statuses.some((status) => !hasViewed(status, viewerId)),
      lastCreatedAt: statuses[statuses.length - 1]?.createdAt ?? "",
    }))
    .sort((a, b) => {
      if (a.hasUnseen !== b.hasUnseen) return a.hasUnseen ? -1 : 1;
      return b.lastCreatedAt.localeCompare(a.lastCreatedAt);
    });
}

/** Estados de un autor concreto (para abrir el visor). */
export function getStatusesByAuthor(
  state: StatusesState,
  authorId: UserId,
  now = Date.now(),
): StatusUpdate[] {
  return getActiveStatuses(state, now).filter((status) => status.authorId === authorId);
}

export interface PublishStatusInput {
  kind: StatusKind;
  /** Texto del estado o leyenda de la foto/video. */
  body: string;
  backgroundColor?: string | null;
  mediaUrl?: string | null;
  audience?: StatusAudience;
  authorId?: UserId;
}

/** Publicar un estado (texto o foto/video simulada). */
export function publishStatus(
  state: StatusesState,
  input: PublishStatusInput,
): { state: StatusesState; status: StatusUpdate } {
  const createdAt = new Date();
  const status: StatusUpdate = {
    id: nextId("status"),
    authorId: input.authorId ?? CURRENT_USER_ID,
    kind: input.kind,
    body: input.body.trim(),
    backgroundColor: input.kind === "text" ? input.backgroundColor ?? STATUS_BACKGROUNDS[0]!.color : null,
    mediaUrl: input.kind === "media" ? input.mediaUrl ?? null : null,
    audience: input.audience ?? DEFAULT_STATUS_AUDIENCE,
    createdAt: createdAt.toISOString(),
    expiresAt: new Date(createdAt.getTime() + STATUS_TTL_MS).toISOString(),
    views: [],
  };
  return { state: { ...state, statuses: [...state.statuses, status] }, status };
}

/** Marcar un estado como visto (idempotente). */
export function markStatusViewed(
  state: StatusesState,
  statusId: StatusId,
  viewerId: UserId = CURRENT_USER_ID,
): StatusesState {
  return {
    ...state,
    statuses: state.statuses.map((status) =>
      status.id === statusId && !hasViewed(status, viewerId)
        ? {
            ...status,
            views: [...status.views, { viewerId, viewedAt: new Date().toISOString() }],
          }
        : status,
    ),
  };
}

/** Eliminar un estado propio. */
export function deleteStatus(state: StatusesState, statusId: StatusId): StatusesState {
  return { ...state, statuses: state.statuses.filter((status) => status.id !== statusId) };
}

/** Lista de vistas de un estado, de la más reciente a la más antigua. */
export function getStatusViewers(state: StatusesState, statusId: StatusId) {
  const status = state.statuses.find((item) => item.id === statusId);
  return [...(status?.views ?? [])].sort((a, b) => b.viewedAt.localeCompare(a.viewedAt));
}

/** Cita corta del estado, usada al responder por chat 1 a 1. */
export function buildStatusReply(status: StatusUpdate): StatusReplyRef {
  return {
    statusId: status.id,
    authorId: status.authorId,
    preview:
      status.kind === "media"
        ? status.body || "Foto de estado"
        : status.body || "Estado",
  };
}

/** Etiqueta legible del selector de audiencia. */
export function describeAudience(audience: StatusAudience): string {
  const count = audience.contactIds.length;
  switch (audience.mode) {
    case "except":
      return count > 0 ? `Todos excepto ${count}` : "Excepto…";
    case "only":
      return count > 0 ? `Solo con ${count}` : "Compartir solo con…";
    default:
      return "Todos mis contactos";
  }
}

export const STATUS_AUDIENCE_OPTIONS: Array<{ mode: StatusAudienceMode; label: string }> = [
  { mode: "all", label: "Todos mis contactos" },
  { mode: "except", label: "Excepto…" },
  { mode: "only", label: "Compartir solo con…" },
];

/** Construye la audiencia a partir del selector de contactos. */
export function buildAudience(mode: StatusAudienceMode, contactIds: ContactId[]): StatusAudience {
  return { mode, contactIds: mode === "all" ? [] : contactIds };
}
