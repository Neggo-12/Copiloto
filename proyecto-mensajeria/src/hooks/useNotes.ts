import { useCallback, useMemo, useState } from "react";
import * as noteActions from "@/lib/actions/notes";
import type { NoteDraftPatch, NotesState } from "@/lib/actions/notes";
import { MOCK_NOTES } from "@/lib/domain/mock-data";
import type { Note, NoteId } from "@/lib/domain/types";

const INITIAL_STATE: NotesState = { notes: MOCK_NOTES };

export interface NotesController {
  state: NotesState;
  activeNotes: Note[];
  archivedNotes: Note[];
  search: (query: string) => Note[];
  findNote: (noteId: NoteId) => Note | null;
  createNote: () => NoteId;
  editNote: (noteId: NoteId, patch: NoteDraftPatch) => void;
  attachVoiceNote: (noteId: NoteId, durationSeconds: number, waveform: number[]) => void;
  removeVoiceNote: (noteId: NoteId) => void;
  setReminder: (noteId: NoteId, time: string) => void;
  clearReminder: (noteId: NoteId) => void;
  toggleArchived: (noteId: NoteId) => void;
  setIsTask: (noteId: NoteId, isTask: boolean) => void;
  completeTask: (noteId: NoteId) => void;
  reopenTask: (noteId: NoteId) => void;
  toggleTask: (noteId: NoteId) => void;
  deleteNote: (noteId: NoteId) => void;
  closeEditor: (noteId: NoteId) => void;
}

/**
 * Controlador de la pestaña Notas: acciones aisladas ya vinculadas al estado
 * local. El autoguardado es implícito — cada cambio del editor persiste al
 * instante y al salir solo se descartan las notas que quedaron vacías.
 */
export function useNotes(): NotesController {
  const [state, setState] = useState<NotesState>(INITIAL_STATE);

  const createNote = useCallback(() => {
    const note = noteActions.buildNote();
    setState((prev) => ({ notes: [note, ...prev.notes] }));
    return note.id;
  }, []);

  const editNote = useCallback((noteId: NoteId, patch: NoteDraftPatch) => {
    setState((prev) => noteActions.editNote(prev, noteId, patch));
  }, []);

  const attachVoiceNote = useCallback(
    (noteId: NoteId, durationSeconds: number, waveform: number[]) => {
      setState((prev) => noteActions.attachVoiceNote(prev, noteId, durationSeconds, waveform));
    },
    [],
  );

  const removeVoiceNote = useCallback((noteId: NoteId) => {
    setState((prev) => noteActions.removeVoiceNote(prev, noteId));
  }, []);

  const setReminder = useCallback((noteId: NoteId, time: string) => {
    setState((prev) => noteActions.setNoteReminder(prev, noteId, time));
  }, []);

  const clearReminder = useCallback((noteId: NoteId) => {
    setState((prev) => noteActions.clearNoteReminder(prev, noteId));
  }, []);

  const toggleArchived = useCallback((noteId: NoteId) => {
    setState((prev) => noteActions.toggleNoteArchived(prev, noteId));
  }, []);

  const setIsTask = useCallback((noteId: NoteId, isTask: boolean) => {
    setState((prev) => noteActions.setNoteIsTask(prev, noteId, isTask));
  }, []);

  const completeTask = useCallback((noteId: NoteId) => {
    setState((prev) => noteActions.completeTask(prev, noteId));
  }, []);

  const reopenTask = useCallback((noteId: NoteId) => {
    setState((prev) => noteActions.reopenTask(prev, noteId));
  }, []);

  const toggleTask = useCallback((noteId: NoteId) => {
    setState((prev) => noteActions.toggleTask(prev, noteId));
  }, []);

  const deleteNote = useCallback((noteId: NoteId) => {
    setState((prev) => noteActions.deleteNote(prev, noteId));
  }, []);

  const closeEditor = useCallback((noteId: NoteId) => {
    setState((prev) => noteActions.discardIfEmpty(prev, noteId));
  }, []);

  const search = useCallback((query: string) => noteActions.searchNotes(state, query), [state]);
  const findNote = useCallback((noteId: NoteId) => noteActions.findNote(state, noteId), [state]);

  const activeNotes = useMemo(() => noteActions.getActiveNotes(state), [state]);
  const archivedNotes = useMemo(() => noteActions.getArchivedNotes(state), [state]);

  return {
    state,
    activeNotes,
    archivedNotes,
    search,
    findNote,
    createNote,
    editNote,
    attachVoiceNote,
    removeVoiceNote,
    setReminder,
    clearReminder,
    toggleArchived,
    setIsTask,
    completeTask,
    reopenTask,
    toggleTask,
    deleteNote,
    closeEditor,
  };
}
