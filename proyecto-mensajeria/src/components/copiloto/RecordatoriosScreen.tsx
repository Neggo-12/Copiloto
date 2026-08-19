import { useState } from "react";
import type { ReactNode } from "react";
import { PhoneScreen } from "@/components/shared/PhoneScreen";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, MapPin, NavigationArrow, Plus, Spinner, Trash2 } from "@/components/shared/icons";
import { formatChatTimestamp } from "@/lib/format";
import type { LocationRemindersController } from "@/hooks/useLocationReminders";

const STATUS_LABEL: Record<
  string,
  { label: string; variant: "default" | "secondary" | "outline" }
> = {
  pending: { label: "Pendiente", variant: "outline" },
  triggered: { label: "Cumplido", variant: "default" },
  cancelled: { label: "Cancelado", variant: "secondary" },
};

/** Pantalla real de "Recordatorios por ubicación" — `GET/POST/DELETE /location-reminders` (ADR-0015). */
export function RecordatoriosScreen({
  controller,
  tabBar,
  subNav,
}: {
  controller: LocationRemindersController;
  tabBar: ReactNode;
  subNav?: ReactNode;
}) {
  const { loading, error, reminders, createAtAddress, createAtCoordinates, cancel } = controller;
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState("");
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleCreateByAddress() {
    if (!message.trim() || !address.trim()) return;
    setBusy(true);
    setFormError(null);
    try {
      await createAtAddress(message.trim(), address.trim());
      setCreating(false);
      setMessage("");
      setAddress("");
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "No se pudo crear el recordatorio.");
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateHere() {
    if (!message.trim() || !navigator.geolocation) return;
    setBusy(true);
    setFormError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        void createAtCoordinates(
          message.trim(),
          position.coords.latitude,
          position.coords.longitude,
          undefined,
          "Ubicación actual",
        )
          .then(() => {
            setCreating(false);
            setMessage("");
            setAddress("");
          })
          .catch((err: unknown) =>
            setFormError(err instanceof Error ? err.message : "No se pudo crear el recordatorio."),
          )
          .finally(() => setBusy(false));
      },
      (geoError) => {
        setFormError(geoError.message || "No se pudo obtener tu ubicación actual.");
        setBusy(false);
      },
    );
  }

  return (
    <PhoneScreen title="Recordatorios" showThemeToggle className="justify-between">
      {subNav}
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-4">
        {loading && (
          <div className="flex items-center gap-2 text-[14px] text-muted-foreground">
            <Spinner className="size-4 animate-spin" /> Cargando...
          </div>
        )}
        {error && (
          <p className="rounded-xl bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
            {error}
          </p>
        )}

        {!creating && (
          <Button size="sm" variant="outline" onClick={() => setCreating(true)}>
            <Plus className="size-4" /> Nuevo recordatorio
          </Button>
        )}

        {creating && (
          <div className="space-y-2 rounded-2xl border border-border bg-card p-3">
            <input
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="¿Qué te recuerdo? (ej. Comprar pan)"
              className="w-full rounded-lg border border-input bg-background px-2 py-1.5 text-[14px] outline-none"
            />
            <input
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              placeholder="Dirección (ej. Belén, Medellín)"
              className="w-full rounded-lg border border-input bg-background px-2 py-1.5 text-[14px] outline-none"
            />
            {formError && <p className="text-[12px] text-destructive">{formError}</p>}
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={busy || !message.trim() || !address.trim()}
                onClick={() => void handleCreateByAddress()}
              >
                Buscar dirección
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy || !message.trim()}
                onClick={() => void handleCreateHere()}
              >
                <NavigationArrow className="size-4" /> Usar mi ubicación
              </Button>
            </div>
          </div>
        )}

        {!loading && reminders.length === 0 && (
          <p className="px-1 py-8 text-center text-[14px] text-muted-foreground">
            Todavía no tienes recordatorios por ubicación.
          </p>
        )}

        {reminders.map((reminder) => {
          const statusMeta = STATUS_LABEL[reminder.status] ?? STATUS_LABEL["pending"]!;
          return (
            <div
              key={reminder.id}
              className="flex items-start gap-3 rounded-2xl border border-border bg-card p-3"
            >
              <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                <Bell className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-medium">{reminder.message}</p>
                <p className="flex items-center gap-1 truncate text-[12px] text-muted-foreground">
                  <MapPin className="size-3.5 shrink-0" />
                  {reminder.label ??
                    `${reminder.latitude.toFixed(4)}, ${reminder.longitude.toFixed(4)}`}{" "}
                  · {reminder.radiusMeters}m
                </p>
                <div className="mt-1.5 flex items-center gap-2">
                  <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
                  <span className="text-[11px] text-muted-foreground">
                    {formatChatTimestamp(reminder.triggeredAt ?? reminder.createdAt)}
                  </span>
                </div>
              </div>
              {reminder.status === "pending" && (
                <button
                  type="button"
                  onClick={() => void cancel(reminder.id)}
                  aria-label="Cancelar recordatorio"
                  className="press touch-target grid shrink-0 place-items-center rounded-full text-muted-foreground active:bg-secondary"
                >
                  <Trash2 className="size-4" />
                </button>
              )}
            </div>
          );
        })}
      </div>
      {tabBar}
    </PhoneScreen>
  );
}
