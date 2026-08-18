import {
  Archive,
  ArchiveRestore,
  Bell,
  Check,
  ListChecks,
  Trash2,
  X,
} from "@/components/shared/icons";
import { useState } from "react";
import { DetailScreen } from "@/components/shared/DetailScreen";
import { VoiceRecorder } from "@/components/shared/VoiceRecorder";
import { VoiceNotePlayer } from "@/components/chats/VoiceNotePlayer";
import { reminderIsoFromTime } from "@/lib/actions/notes";
import type { NoteId } from "@/lib/domain/types";
import type { NotesController } from "@/hooks/useNotes";

/** Hora "HH:mm" para el selector, a partir del recordatorio guardado. */
function timeValueOf(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

/**
 * Pantalla 2: crear/editar nota. No hay botón "Guardar": cada cambio persiste
 * al instante y al volver se descarta la nota si quedó vacía.
 */
export function NoteEditorScreen({
  controller,
  noteId,
  onBack,
}: {
  controller: NotesController;
  noteId: NoteId;
  onBack: () => void;
}) {
  const note = controller.findNote(noteId);
  const [reminderTime, setReminderTime] = useState(() => timeValueOf(note?.reminderAt ?? null));
  const hasReminder = Boolean(note?.reminderAt) || reminderTime !== "";

  // La nota puede desaparecer si se eliminó desde el propio editor.
  if (!note) return null;

  const toggleReminder = (enabled: boolean) => {
    if (enabled) {
      const now = new Date();
      const suggestion = `${String(now.getHours()).padStart(2, "0")}:${String(
        now.getMinutes(),
      ).padStart(2, "0")}`;
      setReminderTime(suggestion);
      controller.setReminder(noteId, suggestion);
    } else {
      setReminderTime("");
      controller.clearReminder(noteId);
    }
  };

  return (
    <DetailScreen
      onBack={onBack}
      title="Nota"
      trailing={
        <button
          type="button"
          aria-label="Eliminar nota"
          onClick={() => {
            controller.deleteNote(noteId);
            onBack();
          }}
          className="press touch-target grid place-items-center rounded-full text-destructive active:bg-secondary"
        >
          <Trash2 className="size-5" />
        </button>
      }
    >
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
        <input
          value={note.title ?? ""}
          onChange={(event) => controller.editNote(noteId, { title: event.target.value })}
          placeholder="Título (opcional)"
          className="w-full bg-transparent text-[22px] font-bold tracking-tight outline-none placeholder:font-semibold placeholder:text-muted-foreground"
        />

        <textarea
          value={note.body}
          onChange={(event) => controller.editNote(noteId, { body: event.target.value })}
          placeholder="Escribe lo que quieras recordar…"
          className="mt-3 min-h-48 w-full resize-none bg-transparent text-[16px] leading-relaxed outline-none placeholder:text-muted-foreground"
        />

        <section className="mt-2 space-y-3">
          {note.attachment?.kind === "voice" ? (
            <div className="flex items-center gap-2 rounded-2xl border border-border bg-surface p-3">
              <VoiceNotePlayer
                durationSeconds={note.attachment.durationSeconds ?? 0}
                waveform={note.attachment.waveform}
                outgoing={false}
              />
              <button
                type="button"
                aria-label="Quitar nota de voz"
                onClick={() => controller.removeVoiceNote(noteId)}
                className="press ml-auto grid size-9 place-items-center rounded-full text-muted-foreground"
              >
                <X className="size-4" />
              </button>
            </div>
          ) : (
            <VoiceRecorder
              onRecorded={(durationSeconds, waveform) =>
                controller.attachVoiceNote(noteId, durationSeconds, waveform)
              }
            />
          )}

          <div className="rounded-2xl border border-border bg-surface p-3">
            <label className="flex items-center gap-3">
              <ListChecks className="size-5 shrink-0 text-primary" />
              <span className="min-w-0 flex-1 text-[15px] font-medium">Es una tarea</span>
              <input
                type="checkbox"
                checked={note.isTask}
                onChange={(event) => controller.setIsTask(noteId, event.target.checked)}
                className="size-6 shrink-0 accent-[var(--color-primary)]"
              />
            </label>
            {note.isTask && (
              <div className="mt-3 flex items-center gap-3 border-t border-border/70 pt-3">
                <button
                  type="button"
                  onClick={() => controller.toggleTask(noteId)}
                  className={`press touch-target flex items-center gap-2 rounded-xl border px-3 text-[14px] font-medium ${
                    note.taskStatus === "done"
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border text-muted-foreground"
                  }`}
                >
                  <Check className="size-4" />
                  {note.taskStatus === "done" ? "Cumplida" : "Pendiente"}
                </button>
                <p className="text-[13px] text-muted-foreground">
                  Toca para cambiar el estado. También puedes marcarla desde la lista.
                </p>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-border bg-surface p-3">
            <label className="flex items-center gap-3">
              <Bell className="size-5 shrink-0 text-primary" />
              <span className="min-w-0 flex-1 text-[15px] font-medium">Recordarme a esta hora</span>
              <input
                type="checkbox"
                checked={hasReminder}
                onChange={(event) => toggleReminder(event.target.checked)}
                className="size-6 shrink-0 accent-[var(--color-primary)]"
              />
            </label>
            {hasReminder && (
              <div className="mt-3 flex items-center gap-3 border-t border-border/70 pt-3">
                <input
                  type="time"
                  value={reminderTime}
                  onChange={(event) => {
                    setReminderTime(event.target.value);
                    if (reminderIsoFromTime(event.target.value)) {
                      controller.setReminder(noteId, event.target.value);
                    }
                  }}
                  className="touch-target w-32 shrink-0 rounded-xl border border-border bg-secondary px-3 font-mono text-[16px] outline-none"
                />
                <p className="text-[13px] text-muted-foreground">
                  Te avisaremos a esa hora. Sin el interruptor, la nota se guarda sin hora.
                </p>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              controller.toggleArchived(noteId);
              onBack();
            }}
            className="press touch-target flex w-full items-center justify-center gap-2 rounded-2xl border border-border px-4 py-3 text-[15px] font-medium text-muted-foreground active:bg-secondary"
          >
            {note.archivedAt ? (
              <ArchiveRestore className="size-5" />
            ) : (
              <Archive className="size-5" />
            )}
            {note.archivedAt ? "Restaurar nota" : "Archivar nota"}
          </button>
        </section>
      </div>
    </DetailScreen>
  );
}
