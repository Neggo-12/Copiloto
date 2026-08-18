import { Archive, ArchiveRestore, Bell, Check, Mic, Plus, Search, Trash2 } from "@/components/shared/icons";
import { useMemo, useState } from "react";
import { PhoneScreen } from "@/components/shared/PhoneScreen";
import { SwipeableRow } from "@/components/chats/SwipeableRow";
import { filterNotes, noteDisplayTitle, notePreview } from "@/lib/actions/notes";
import type { NoteFilter } from "@/lib/actions/notes";
import { formatChatTimestamp, formatClock, formatDuration } from "@/lib/format";
import type { Note, NoteId } from "@/lib/domain/types";
import type { NotesController } from "@/hooks/useNotes";
import type { ReactNode } from "react";

const FILTERS: { value: NoteFilter; label: string }[] = [
  { value: "all", label: "Todas" },
  { value: "pending", label: "Pendientes" },
  { value: "done", label: "Cumplidas" },
];

/** Pantalla 1: libreta personal con buscador, swipe y botón flotante. */
export function NoteListScreen({
  controller,
  onOpenNote,
  tabBar,
}: {
  controller: NotesController;
  onOpenNote: (noteId: NoteId) => void;
  tabBar: ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<NoteFilter>("all");
  const [showArchived, setShowArchived] = useState(false);
  const results = useMemo(() => controller.search(query), [controller, query]);
  const list = useMemo(
    () => (showArchived ? controller.archivedNotes : filterNotes(results, filter)),
    [showArchived, controller.archivedNotes, results, filter],
  );

  return (
    <PhoneScreen title="Notas" showThemeToggle className="justify-between">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="sticky top-0 z-10 space-y-2 bg-background/90 px-4 py-3 backdrop-blur">
          <label className="flex items-center gap-2 rounded-2xl border border-border bg-secondary px-3">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setShowArchived(false);
              }}
              placeholder="Buscar en tus notas"
              className="touch-target w-full bg-transparent text-[16px] outline-none placeholder:text-muted-foreground"
            />
          </label>
          {!showArchived && (
            <div className="flex gap-2">
              {FILTERS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={filter === option.value}
                  onClick={() => setFilter(option.value)}
                  className={`press rounded-full border px-3 py-1.5 text-[13px] font-medium ${
                    filter === option.value
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border text-muted-foreground"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}
          {controller.archivedNotes.length > 0 && (
            <button
              type="button"
              onClick={() => setShowArchived((prev) => !prev)}
              className="press text-[13px] font-medium text-primary"
            >
              {showArchived
                ? "Ver mis notas"
                : `Ver archivadas (${controller.archivedNotes.length})`}
            </button>
          )}
        </div>

        {list.length === 0 ? (
          <p className="px-8 py-16 text-center text-[15px] leading-relaxed text-muted-foreground">
            {showArchived
              ? "Nada guardado en el archivo de tu copiloto."
              : query
                ? `Ninguna nota coincide con “${query}”.`
                : filter === "pending"
                  ? "Sin pendientes: tu copiloto tiene la agenda despejada."
                  : filter === "done"
                    ? "Aún no marcas nada como cumplido. Tu copiloto lo anotará aquí."
                    : "Tu copiloto está listo para escuchar. Toca + para escribir o grabar tu primera nota."}
          </p>
        ) : (
          <ul className="divide-y divide-border/70 border-y border-border/70">
            {list.map((note) => (
              <li key={note.id}>
                <SwipeableRow
                  actions={[
                    {
                      label: note.archivedAt ? "Restaurar" : "Archivar",
                      icon: note.archivedAt ? (
                        <ArchiveRestore className="size-5" />
                      ) : (
                        <Archive className="size-5" />
                      ),
                      onAction: () => controller.toggleArchived(note.id),
                    },
                    {
                      label: "Eliminar",
                      icon: <Trash2 className="size-5" />,
                      onAction: () => controller.deleteNote(note.id),
                      variant: "destructive",
                    },
                  ]}
                >
                  <NoteRow
                    note={note}
                    onOpen={() => onOpenNote(note.id)}
                    onToggleTask={() => controller.toggleTask(note.id)}
                  />
                </SwipeableRow>
              </li>
            ))}
          </ul>
        )}
        <div className="h-24" />
      </div>

      <button
        type="button"
        onClick={() => onOpenNote(controller.createNote())}
        aria-label="Nota nueva"
        className="press absolute right-5 bottom-24 grid size-14 place-items-center rounded-full bg-primary text-primary-foreground shadow-sheet"
      >
        <Plus className="size-7" />
      </button>

      {tabBar}
    </PhoneScreen>
  );
}

function NoteRow({
  note,
  onOpen,
  onToggleTask,
}: {
  note: Note;
  onOpen: () => void;
  onToggleTask: () => void;
}) {
  const preview = notePreview(note);
  const duration = note.attachment?.durationSeconds;
  const isDone = note.isTask && note.taskStatus === "done";

  return (
    <div className="flex w-full items-start bg-background">
      {note.isTask && (
        <button
          type="button"
          role="checkbox"
          aria-checked={isDone}
          aria-label={isDone ? "Marcar como pendiente" : "Marcar como cumplida"}
          onClick={onToggleTask}
          className="press touch-target grid shrink-0 place-items-center pl-4"
        >
          <span
            className={`grid size-6 place-items-center rounded-md border ${
              isDone ? "border-primary bg-primary text-primary-foreground" : "border-border"
            }`}
          >
            {isDone && <Check className="size-4" />}
          </span>
        </button>
      )}
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-start gap-3 px-4 py-3.5 text-left active:bg-secondary"
      >
        {note.kind === "voice" && (
          <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-secondary text-primary">
            <Mic className="size-4" />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span
              className={`min-w-0 flex-1 truncate text-[16px] font-semibold tracking-tight ${
                isDone ? "text-muted-foreground line-through" : ""
              }`}
            >
              {noteDisplayTitle(note)}
            </span>
            <span className="shrink-0 font-mono text-[12px] text-muted-foreground">
              {formatChatTimestamp(note.updatedAt || note.createdAt)}
            </span>
          </span>
          <span className="mt-0.5 flex items-center gap-2">
            <span
              className={`min-w-0 flex-1 truncate text-[14px] text-muted-foreground ${
                isDone ? "line-through" : ""
              }`}
            >
              {note.kind === "voice" && duration
                ? `Nota de voz · ${formatDuration(duration)}`
                : preview}
            </span>
            {note.reminderAt && (
              <span className="flex shrink-0 items-center gap-1 font-mono text-[11px] text-primary">
                <Bell className="size-3.5" />
                {formatClock(note.reminderAt)}
              </span>
            )}
          </span>
        </span>
      </button>
    </div>
  );
}
