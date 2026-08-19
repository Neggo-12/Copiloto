import {
  Archive,
  ArchiveRestore,
  Bell,
  Check,
  ListChecks,
  MapPin,
  Trash2,
} from "@/components/shared/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DetailScreen } from "@/components/shared/DetailScreen";
import { formatChatTimestamp } from "@/lib/format";
import type { RemindersController } from "@/hooks/useReminders";

const STATUS_LABEL: Record<
  string,
  { label: string; variant: "default" | "secondary" | "outline" }
> = {
  pending: { label: "Activo", variant: "outline" },
  triggered: { label: "Cumplido", variant: "default" },
  cancelled: { label: "Cancelado", variant: "secondary" },
};

/**
 * Pantalla de detalle/edición. Una nota o tarea se edita libremente
 * (autoguardado, sin botón "Guardar"). Un recordatorio de ubicación no se
 * edita — se creó ya geocodificado (por voz o por dirección) — esta
 * pantalla solo muestra su estado y permite cancelarlo.
 */
export function RemindersEditorScreen({
  controller,
  reminderId,
  onBack,
}: {
  controller: RemindersController;
  reminderId: string;
  onBack: () => void;
}) {
  const item = [...controller.reminders, ...controller.archivedReminders].find(
    (r) => r.id === reminderId,
  );

  if (!item) return null;

  if (item.kind === "location") {
    const statusMeta = STATUS_LABEL[item.status] ?? STATUS_LABEL["pending"]!;
    return (
      <DetailScreen onBack={onBack} title="Recordatorio de lugar">
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
          <div className="rounded-2xl border border-border bg-surface p-4">
            <p className="flex items-center gap-2 text-[15px] font-semibold">
              <Bell className="size-4 text-primary" /> {item.message}
            </p>
            <p className="mt-2 flex items-center gap-1 text-[13px] text-muted-foreground">
              <MapPin className="size-3.5 shrink-0" />
              {item.label ?? `${item.latitude?.toFixed(4)}, ${item.longitude?.toFixed(4)}`} ·{" "}
              {item.radiusMeters}m
            </p>
            <div className="mt-2 flex items-center gap-2">
              <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
              <span className="text-[11px] text-muted-foreground">
                {formatChatTimestamp(item.triggeredAt ?? item.createdAt)}
              </span>
            </div>
          </div>

          {item.status === "pending" && (
            <button
              type="button"
              onClick={() => {
                void controller.cancelLocation(item.id);
                onBack();
              }}
              className="press touch-target mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-border px-4 py-3 text-[15px] font-medium text-destructive active:bg-secondary"
            >
              <Trash2 className="size-5" /> Cancelar recordatorio
            </button>
          )}
        </div>
      </DetailScreen>
    );
  }

  return (
    <DetailScreen
      onBack={onBack}
      title="Nota"
      trailing={
        <button
          type="button"
          aria-label="Eliminar nota"
          onClick={() => {
            void controller.removeNote(item.id);
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
          defaultValue={item.title ?? ""}
          onBlur={(event) =>
            void controller.updateText(item.id, { title: event.target.value || null })
          }
          placeholder="Título (opcional)"
          className="w-full bg-transparent text-[22px] font-bold tracking-tight outline-none placeholder:font-semibold placeholder:text-muted-foreground"
        />

        <textarea
          defaultValue={item.message}
          onBlur={(event) => void controller.updateText(item.id, { message: event.target.value })}
          placeholder="Escribe lo que quieras recordar…"
          className="mt-3 min-h-48 w-full resize-none bg-transparent text-[16px] leading-relaxed outline-none placeholder:text-muted-foreground"
        />

        <section className="mt-2 space-y-3">
          <div className="rounded-2xl border border-border bg-surface p-3">
            <label className="flex items-center gap-3">
              <ListChecks className="size-5 shrink-0 text-primary" />
              <span className="min-w-0 flex-1 text-[15px] font-medium">Es una tarea</span>
              <input
                type="checkbox"
                checked={item.isTask}
                onChange={(event) => void controller.setIsTask(item.id, event.target.checked)}
                className="size-6 shrink-0 accent-[var(--color-primary)]"
              />
            </label>
            {item.isTask && (
              <div className="mt-3 flex items-center gap-3 border-t border-border/70 pt-3">
                <Button
                  size="sm"
                  variant={item.completedAt ? "default" : "outline"}
                  onClick={() => void controller.toggleTaskCompleted(item.id)}
                >
                  <Check className="size-4" />
                  {item.completedAt ? "Cumplida" : "Pendiente"}
                </Button>
                <p className="text-[13px] text-muted-foreground">
                  Toca para cambiar el estado. También puedes marcarla desde la lista.
                </p>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              void controller.toggleArchived(item.id);
              onBack();
            }}
            className="press touch-target flex w-full items-center justify-center gap-2 rounded-2xl border border-border px-4 py-3 text-[15px] font-medium text-muted-foreground active:bg-secondary"
          >
            {item.archivedAt ? (
              <ArchiveRestore className="size-5" />
            ) : (
              <Archive className="size-5" />
            )}
            {item.archivedAt ? "Restaurar nota" : "Archivar nota"}
          </button>
        </section>
      </div>
    </DetailScreen>
  );
}
