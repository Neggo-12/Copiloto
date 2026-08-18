import { useState } from "react";
import type { ReactNode } from "react";
import { NoteListScreen } from "@/components/notes/NoteListScreen";
import { NoteEditorScreen } from "@/components/notes/NoteEditorScreen";
import { useNotes } from "@/hooks/useNotes";
import type { NoteId } from "@/lib/domain/types";

/** Pestaña Notas: alterna entre la libreta y el editor de una nota. */
export function NotesTab({ tabBar }: { tabBar: ReactNode }) {
  const controller = useNotes();
  const [openNoteId, setOpenNoteId] = useState<NoteId | null>(null);

  if (openNoteId) {
    return (
      <NoteEditorScreen
        controller={controller}
        noteId={openNoteId}
        onBack={() => {
          // Autoguardado: al salir solo se descarta la nota si quedó vacía.
          controller.closeEditor(openNoteId);
          setOpenNoteId(null);
        }}
      />
    );
  }

  return <NoteListScreen controller={controller} tabBar={tabBar} onOpenNote={setOpenNoteId} />;
}
