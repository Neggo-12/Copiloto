/**
 * Acciones aisladas y reutilizables de la libreta personal (Notas).
 * Mismo patrón que `chats.ts`: funciones puras sobre `NotesState`, de modo que
 * al conectar el backend real solo cambie la implementación, no las firmas.
 */
import type {
  MessageAttachment,
  Note,
  NoteId,
  NoteKind,
  TaskStatus,
  UserId,
} from "@/lib/domain/types";
import { CURRENT_USER_ID } from "@/lib/domain/mock-data";

export interface NotesState {
  notes: Note[];
}

let sequence = 0;
function nextId(prefix: string): string {
  sequence += 1;
  return `${prefix}_${Date.now().toString(36)}_${sequence}`;
}

/** Título visible: el título propio o las primeras palabras del contenido. */
export function noteDisplayTitle(note: Note): string {
  const title = note.title?.trim();
  if (title) return title;
  const body = note.body.trim();
  if (body) return body.split(/\s+/).slice(0, 8).join(" ");
  return note.kind === "voice" ? "Nota de voz" : "Nota sin título";
}

/** Resumen de una línea para la lista. */
export function notePreview(note: Note): string {
  if (note.kind === "voice" && note.attachment) return "Nota de voz";
  const body = note.body.trim();
  const title = note.title?.trim();
  if (title && body) return body;
  return body ? "" : "Sin contenido";
}

/** Una nota vacía (sin título, sin cuerpo y sin audio) no se conserva. */
export function isNoteEmpty(note: Note): boolean {
  return !note.title?.trim() && !note.body.trim() && !note.attachment;
}

/** Última actividad: edición si existe, si no la creación. */
export function noteActivityAt(note: Note): string {
  return note.updatedAt || note.createdAt;
}

export function getActiveNotes(state: NotesState): Note[] {
  return state.notes
    .filter((note) => !note.archivedAt)
    .sort((a, b) => noteActivityAt(b).localeCompare(noteActivityAt(a)));
}

export function getArchivedNotes(state: NotesState): Note[] {
  return state.notes
    .filter((note) => note.archivedAt)
    .sort((a, b) => noteActivityAt(b).localeCompare(noteActivityAt(a)));
}

export function findNote(state: NotesState, noteId: NoteId): Note | null {
  return state.notes.find((note) => note.id === noteId) ?? null;
}

/** Busca por título y contenido (solo notas activas). */
export function searchNotes(state: NotesState, query: string): Note[] {
  const term = query.trim().toLowerCase();
  const active = getActiveNotes(state);
  if (!term) return active;
  return active.filter(
    (note) =>
      (note.title ?? "").toLowerCase().includes(term) ||
      note.body.toLowerCase().includes(term) ||
      (note.kind === "voice" && "nota de voz".includes(term)),
  );
}

export interface CreateNoteInput {
  kind?: NoteKind;
  title?: string | null;
  body?: string;
  attachment?: MessageAttachment | null;
  reminderAt?: string | null;
  ownerId?: UserId;
  isTask?: boolean;
}

export function buildNote(input: CreateNoteInput = {}): Note {
  const now = new Date().toISOString();
  return {
    id: nextId("note"),
    ownerId: input.ownerId ?? CURRENT_USER_ID,
    kind: input.kind ?? "text",
    title: input.title?.trim() ? input.title.trim() : null,
    body: input.body ?? "",
    attachment: input.attachment ?? null,
    reminderAt: input.reminderAt ?? null,
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
    isTask: input.isTask ?? false,
    taskStatus: input.isTask ? "pending" : null,
    completedAt: null,
  };
}

/** Crear nota nueva. */
export function createNote(
  state: NotesState,
  input: CreateNoteInput = {},
): { state: NotesState; note: Note } {
  const note = buildNote(input);
  return { state: { notes: [note, ...state.notes] }, note };
}

export interface NoteDraftPatch {
  title?: string | null;
  body?: string;
  attachment?: MessageAttachment | null;
  kind?: NoteKind;
  reminderAt?: string | null;
}

/** Editar nota: solo toca los campos recibidos y refresca `updatedAt`. */
export function editNote(state: NotesState, noteId: NoteId, patch: NoteDraftPatch): NotesState {
  return {
    notes: state.notes.map((note) => {
      if (note.id !== noteId) return note;
      const next: Note = { ...note, updatedAt: new Date().toISOString() };
      if (patch.title !== undefined) next.title = patch.title?.trim() ? patch.title.trim() : null;
      if (patch.body !== undefined) next.body = patch.body;
      if (patch.attachment !== undefined) next.attachment = patch.attachment;
      if (patch.kind !== undefined) next.kind = patch.kind;
      if (patch.reminderAt !== undefined) next.reminderAt = patch.reminderAt;
      return next;
    }),
  };
}

/** Adjuntar la grabación de voz a la nota (grabación simulada en esta fase). */
export function attachVoiceNote(
  state: NotesState,
  noteId: NoteId,
  durationSeconds: number,
  waveform: number[],
): NotesState {
  return editNote(state, noteId, {
    kind: "voice",
    attachment: { kind: "voice", url: "#", durationSeconds, waveform },
  });
}

/** Quitar la grabación y devolver la nota a modo texto. */
export function removeVoiceNote(state: NotesState, noteId: NoteId): NotesState {
  return editNote(state, noteId, { kind: "text", attachment: null });
}

/**
 * Activar recordatorio a una hora concreta ("HH:mm"), hoy o mañana si ya pasó.
 * Una nota sin recordatorio NO recibe ninguna hora por defecto.
 */
export function reminderIsoFromTime(time: string, now = new Date()): string | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  const target = new Date(now);
  target.setHours(hours, minutes, 0, 0);
  if (target.getTime() <= now.getTime()) target.setDate(target.getDate() + 1);
  return target.toISOString();
}

export function setNoteReminder(state: NotesState, noteId: NoteId, time: string): NotesState {
  const reminderAt = reminderIsoFromTime(time);
  if (!reminderAt) return state;
  return editNote(state, noteId, { reminderAt });
}

export function clearNoteReminder(state: NotesState, noteId: NoteId): NotesState {
  return editNote(state, noteId, { reminderAt: null });
}

export function toggleNoteArchived(state: NotesState, noteId: NoteId): NotesState {
  return {
    notes: state.notes.map((note) =>
      note.id === noteId
        ? { ...note, archivedAt: note.archivedAt ? null : new Date().toISOString() }
        : note,
    ),
  };
}

export function deleteNote(state: NotesState, noteId: NoteId): NotesState {
  return { notes: state.notes.filter((note) => note.id !== noteId) };
}

/** Descarta la nota si quedó vacía al salir del editor (autoguardado). */
export function discardIfEmpty(state: NotesState, noteId: NoteId): NotesState {
  const note = findNote(state, noteId);
  if (!note || !isNoteEmpty(note)) return state;
  return deleteNote(state, noteId);
}

// ---------------------------------------------------------------------------
// Capa opcional de tareas: una nota puede marcarse como tarea con estado.
// Las acciones reciben solo el id, para poder invocarse desde la UI o desde un
// comando de voz del copiloto sin pasar por la pantalla.
// ---------------------------------------------------------------------------

/** Marca/desmarca la nota como tarea. Al marcarla queda pendiente. */
export function setNoteIsTask(state: NotesState, noteId: NoteId, isTask: boolean): NotesState {
  return {
    notes: state.notes.map((note) =>
      note.id === noteId
        ? {
            ...note,
            updatedAt: new Date().toISOString(),
            isTask,
            taskStatus: isTask ? (note.taskStatus ?? "pending") : null,
            completedAt: isTask ? note.completedAt : null,
          }
        : note,
    ),
  };
}

/** Cambia el estado de una tarea ya identificada por su id. */
function applyTaskStatus(state: NotesState, noteId: NoteId, status: TaskStatus): NotesState {
  const now = new Date().toISOString();
  return {
    notes: state.notes.map((note) =>
      note.id === noteId && note.isTask
        ? {
            ...note,
            updatedAt: now,
            taskStatus: status,
            completedAt: status === "done" ? now : null,
          }
        : note,
    ),
  };
}

/** Marca como cumplida la tarea con ese id. */
export function completeTask(state: NotesState, noteId: NoteId): NotesState {
  return applyTaskStatus(state, noteId, "done");
}

/** Reabre (vuelve a pendiente) la tarea con ese id. */
export function reopenTask(state: NotesState, noteId: NoteId): NotesState {
  return applyTaskStatus(state, noteId, "pending");
}

/** Alterna cumplida/pendiente reutilizando completeTask y reopenTask. */
export function toggleTask(state: NotesState, noteId: NoteId): NotesState {
  const note = findNote(state, noteId);
  if (!note?.isTask) return state;
  return note.taskStatus === "done" ? reopenTask(state, noteId) : completeTask(state, noteId);
}

export type NoteFilter = "all" | "pending" | "done";

/**
 * Filtro de la lista: solo afecta a las notas-tarea. Las notas normales
 * siempre aparecen en "Todas" y nunca en los filtros de tareas.
 */
export function filterNotes(notes: Note[], filter: NoteFilter): Note[] {
  if (filter === "all") return notes;
  const status: TaskStatus = filter === "done" ? "done" : "pending";
  return notes.filter((note) => note.isTask && note.taskStatus === status);
}
