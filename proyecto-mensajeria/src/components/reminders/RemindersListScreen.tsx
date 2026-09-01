import {
  Archive,
  ArchiveRestore,
  Bell,
  Check,
  Clock,
  MapPin,
  NavigationArrow,
  Plus,
  Search,
  Spinner,
  Trash2,
} from "@/components/shared/icons";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { PhoneScreen } from "@/components/shared/PhoneScreen";
import { Button } from "@/components/ui/button";
import { SwipeableRow } from "@/components/chats/SwipeableRow";
import { formatChatTimestamp } from "@/lib/format";
import type { Reminder, ReminderFilter, RemindersController } from "@/hooks/useReminders";

const FILTERS: { value: ReminderFilter; label: string }[] = [
  { value: "all", label: "Todas" },
  { value: "pending", label: "Pendientes" },
  { value: "done", label: "Cumplidas" },
];

function displayTitle(item: Reminder): string {
  const title = item.title?.trim();
  if (title) return title;
  const body = item.message.trim();
  return body ? body.split(/\s+/).slice(0, 8).join(" ") : "Sin título";
}

function filterByTask(items: Reminder[], filter: ReminderFilter): Reminder[] {
  if (filter === "all") return items;
  return items.filter(
    (item) => item.isTask && (filter === "done" ? item.completedAt : !item.completedAt),
  );
}

/**
 * Sección unificada: notas, tareas y recordatorios por ubicación en una
 * sola libreta (ADR-0023) — antes "Notas" (local) y "Recordatorios"
 * (sub-pestaña de Copiloto) vivían separadas sin razón clara para el
 * usuario.
 */
export function RemindersListScreen({
  controller,
  onOpenReminder,
  tabBar,
}: {
  controller: RemindersController;
  onOpenReminder: (id: string) => void;
  tabBar: ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ReminderFilter>("all");
  const [showArchived, setShowArchived] = useState(false);
  const [creatingLocation, setCreatingLocation] = useState(false);
  const [locationMessage, setLocationMessage] = useState("");
  const [locationAddress, setLocationAddress] = useState("");
  const [locationBusy, setLocationBusy] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const results = useMemo(() => controller.search(query), [controller, query]);
  const list = useMemo(
    () => (showArchived ? controller.archivedReminders : filterByTask(results, filter)),
    [showArchived, controller.archivedReminders, results, filter],
  );

  async function handleCreateLocation() {
    if (!locationMessage.trim() || !locationAddress.trim()) return;
    setLocationBusy(true);
    setLocationError(null);
    try {
      await controller.createAtAddress(locationMessage.trim(), locationAddress.trim());
      setCreatingLocation(false);
      setLocationMessage("");
      setLocationAddress("");
    } catch (err) {
      setLocationError(err instanceof Error ? err.message : "No se pudo crear el recordatorio.");
    } finally {
      setLocationBusy(false);
    }
  }

  function handleCreateLocationHere() {
    if (!locationMessage.trim() || !navigator.geolocation) return;
    setLocationBusy(true);
    setLocationError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        void controller
          .createAtCoordinates(
            locationMessage.trim(),
            position.coords.latitude,
            position.coords.longitude,
            undefined,
            "Ubicación actual",
          )
          .then(() => {
            setCreatingLocation(false);
            setLocationMessage("");
            setLocationAddress("");
          })
          .catch((err: unknown) =>
            setLocationError(
              err instanceof Error ? err.message : "No se pudo crear el recordatorio.",
            ),
          )
          .finally(() => setLocationBusy(false));
      },
      (geoError) => {
        setLocationError(geoError.message || "No se pudo obtener tu ubicación actual.");
        setLocationBusy(false);
      },
    );
  }

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
              placeholder="Buscar notas y recordatorios"
              className="touch-target w-full bg-transparent text-[16px] outline-none placeholder:text-muted-foreground"
            />
          </label>

          {!showArchived && !creatingLocation && (
            <button
              type="button"
              onClick={() => setCreatingLocation(true)}
              className="press flex items-center gap-2 text-[13px] font-medium text-primary"
            >
              <MapPin className="size-4" /> Recordarme al pasar por un lugar
            </button>
          )}

          {creatingLocation && (
            <div className="space-y-2 rounded-2xl border border-border bg-card p-3">
              <input
                value={locationMessage}
                onChange={(event) => setLocationMessage(event.target.value)}
                placeholder="¿Qué te recuerdo? (ej. Comprar unos zapatos)"
                className="w-full rounded-lg border border-input bg-background px-2 py-1.5 text-[14px] outline-none"
              />
              <input
                value={locationAddress}
                onChange={(event) => setLocationAddress(event.target.value)}
                placeholder="Lugar (ej. Aguacatala, Estación del Poblado)"
                className="w-full rounded-lg border border-input bg-background px-2 py-1.5 text-[14px] outline-none"
              />
              {locationError && <p className="text-[12px] text-destructive">{locationError}</p>}
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={locationBusy || !locationMessage.trim() || !locationAddress.trim()}
                  onClick={() => void handleCreateLocation()}
                >
                  Buscar lugar
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={locationBusy || !locationMessage.trim()}
                  onClick={handleCreateLocationHere}
                >
                  <NavigationArrow className="size-4" /> Mi ubicación
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setCreatingLocation(false)}>
                  Cancelar
                </Button>
              </div>
            </div>
          )}

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
          {controller.archivedReminders.length > 0 && (
            <button
              type="button"
              onClick={() => setShowArchived((prev) => !prev)}
              className="press text-[13px] font-medium text-primary"
            >
              {showArchived
                ? "Ver mis notas"
                : `Ver archivadas (${controller.archivedReminders.length})`}
            </button>
          )}
        </div>

        {controller.loading && (
          <div className="flex items-center gap-2 px-4 py-3 text-[14px] text-muted-foreground">
            <Spinner className="size-4 animate-spin" /> Cargando...
          </div>
        )}
        {controller.error && (
          <p className="mx-4 rounded-xl bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
            {controller.error}
          </p>
        )}

        {!controller.loading && list.length === 0 ? (
          <p className="px-8 py-16 text-center text-[15px] leading-relaxed text-muted-foreground">
            {showArchived
              ? "Nada guardado en el archivo."
              : query
                ? `Ninguna nota coincide con “${query}”.`
                : filter === "pending"
                  ? "Sin pendientes: tu agenda está despejada."
                  : filter === "done"
                    ? "Aún no marcas nada como cumplido."
                    : "Toca + para escribir una nota o crear un recordatorio de lugar."}
          </p>
        ) : (
          <ul className="divide-y divide-border/70 border-y border-border/70">
            {list.map((item) => (
              <li key={item.id}>
                <SwipeableRow
                  actions={[
                    {
                      label: item.archivedAt ? "Restaurar" : "Archivar",
                      icon: item.archivedAt ? (
                        <ArchiveRestore className="size-5" />
                      ) : (
                        <Archive className="size-5" />
                      ),
                      onAction: () => void controller.toggleArchived(item.id),
                    },
                    {
                      label: "Eliminar",
                      icon: <Trash2 className="size-5" />,
                      onAction: () => void controller.remove(item.id),
                      variant: "destructive",
                    },
                  ]}
                >
                  <ReminderRow
                    item={item}
                    onOpen={() => onOpenReminder(item.id)}
                    onToggleTask={() => void controller.toggleTaskCompleted(item.id)}
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
        onClick={() =>
          void controller
            .createNote({ message: "" })
            .then((created) => created && onOpenReminder(created.id))
        }
        aria-label="Nota nueva"
        className="press absolute right-5 bottom-24 grid size-14 place-items-center rounded-full bg-primary text-primary-foreground shadow-sheet"
      >
        <Plus className="size-7" />
      </button>

      {tabBar}
    </PhoneScreen>
  );
}

function ReminderRow({
  item,
  onOpen,
  onToggleTask,
}: {
  item: Reminder;
  onOpen: () => void;
  onToggleTask: () => void;
}) {
  const isDone = item.isTask && Boolean(item.completedAt);

  return (
    <div className="flex w-full items-start bg-background">
      {item.isTask && (
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
        {item.kind === "location" && (
          <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-secondary text-primary">
            <Bell className="size-4" />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span
              className={`min-w-0 flex-1 truncate text-[16px] font-semibold tracking-tight ${
                isDone ? "text-muted-foreground line-through" : ""
              }`}
            >
              {displayTitle(item)}
            </span>
            <span className="shrink-0 font-mono text-[12px] text-muted-foreground">
              {formatChatTimestamp(item.createdAt)}
            </span>
          </span>
          <span className="mt-0.5 flex items-center gap-2">
            <span
              className={`min-w-0 flex-1 truncate text-[14px] text-muted-foreground ${isDone ? "line-through" : ""}`}
            >
              {item.kind === "location" ? item.message : item.message || "Sin contenido"}
            </span>
            {item.kind === "location" && (
              <span className="flex shrink-0 items-center gap-1 font-mono text-[11px] text-primary">
                <MapPin className="size-3.5" />
                {item.status === "triggered"
                  ? "Cumplido"
                  : item.status === "cancelled"
                    ? "Cancelado"
                    : "Activo"}
              </span>
            )}
            {item.kind === "note" && item.remindAt && (
              <span className="flex shrink-0 items-center gap-1 font-mono text-[11px] text-primary">
                <Clock className="size-3.5" />
                {formatChatTimestamp(item.remindAt)}
              </span>
            )}
          </span>
          {item.kind === "location" && (item.label ?? null) && (
            <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">
              {item.label}
            </span>
          )}
        </span>
      </button>
    </div>
  );
}
