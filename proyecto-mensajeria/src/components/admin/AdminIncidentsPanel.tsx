import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPin, Mail as MailIcon, Phone as PhoneIcon } from "@/components/shared/icons";
import type { AdminEmergencyIncidentRow } from "@/hooks/useEmergencyAdmin";

type IncidentStatus = AdminEmergencyIncidentRow["status"];
type SettableStatus = Exclude<IncidentStatus, "creado">;

const STATUS_LABEL: Record<IncidentStatus, string> = {
  creado: "Creado",
  recibido: "Recibido",
  en_atencion: "En atención",
  cancelado: "Cancelado",
  cerrado: "Cerrado",
};

/**
 * Próxima acción real que tiene sentido ofrecer desde cada estado — no todas
 * las transiciones posibles del enum, solo el flujo real de un admin
 * atendiendo un SOS: recibirlo, marcarlo en atención, cerrarlo. "Cancelar"
 * siempre queda disponible mientras el caso siga abierto (alguien puede
 * reportar por error, o resolverse solo). Terminal (`cancelado`/`cerrado`):
 * sin acciones, el caso ya no se mueve más desde aquí.
 */
const NEXT_ACTIONS: Record<IncidentStatus, { status: SettableStatus; label: string }[]> = {
  creado: [
    { status: "recibido", label: "Marcar recibido" },
    { status: "cancelado", label: "Cancelar" },
  ],
  recibido: [
    { status: "en_atencion", label: "Marcar en atención" },
    { status: "cancelado", label: "Cancelar" },
  ],
  en_atencion: [
    { status: "cerrado", label: "Cerrar caso" },
    { status: "cancelado", label: "Cancelar" },
  ],
  cancelado: [],
  cerrado: [],
};

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

/**
 * Sección "Incidentes — Llamar a la policía" del dashboard de `/admin`.
 * Empezó como solo lectura (decisión (34)/(35) en docs/decisions/README.md);
 * ahora (decisión pendiente de registrar) agrega la acción real que faltaba:
 * mover el estado del incidente (recibido → en atención → cerrado, o
 * cancelado en cualquier punto) — antes no había NADA que hacer al entrar a
 * un incidente, solo verlo. Cada fila ya trae los datos REALES tomados al
 * momento del incidente (nombre/teléfono/correo, ubicación) — no hace falta
 * unir contra `profiles` desde acá.
 */
export function AdminIncidentsPanel({
  incidents,
  setStatus,
}: {
  incidents: AdminEmergencyIncidentRow[];
  setStatus: (id: string, status: SettableStatus) => Promise<void>;
}) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [errorById, setErrorById] = useState<Record<string, string>>({});

  async function handleSetStatus(id: string, status: SettableStatus) {
    if (pendingId) return; // una acción a la vez — evita doble clic mandando dos PATCH concurrentes por el mismo incidente
    setPendingId(id);
    setErrorById((prev) => ({ ...prev, [id]: "" }));
    try {
      await setStatus(id, status);
    } catch (err) {
      setErrorById((prev) => ({
        ...prev,
        [id]: err instanceof Error ? err.message : "No se pudo actualizar el estado.",
      }));
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-[14px] font-medium">
        Incidentes · Llamar a la policía ({incidents.length})
      </p>
      {incidents.length === 0 && (
        <p className="rounded-xl bg-muted px-3 py-2 text-[13px] text-muted-foreground">
          Ningún incidente todavía.
        </p>
      )}
      {incidents.map((incident) => {
        const actions = NEXT_ACTIONS[incident.status];
        const rowError = errorById[incident.id];
        const isPending = pendingId === incident.id;

        return (
          <div
            key={incident.id}
            className="space-y-1.5 rounded-2xl border border-border bg-card px-3 py-2.5"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-[13px] font-medium">{incident.snapshotDisplayName}</p>
              <Badge variant={incident.status === "creado" ? "secondary" : "outline"}>
                {STATUS_LABEL[incident.status]}
              </Badge>
            </div>
            <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-muted-foreground">
              {incident.snapshotPhone && (
                <span className="flex items-center gap-1">
                  <PhoneIcon className="size-3.5" />
                  {incident.snapshotPhone}
                </span>
              )}
              {incident.snapshotEmail && (
                <span className="flex items-center gap-1">
                  <MailIcon className="size-3.5" />
                  {incident.snapshotEmail}
                </span>
              )}
              <a
                href={`https://www.google.com/maps?q=${incident.latitude},${incident.longitude}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 underline underline-offset-2"
              >
                <MapPin className="size-3.5" />
                {incident.latitude.toFixed(5)}, {incident.longitude.toFixed(5)}
              </a>
            </p>
            <p className="text-[11px] text-muted-foreground">
              {formatWhen(incident.createdAt)} · confianza {incident.confidenceLevel}
            </p>

            {actions.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {actions.map((action) => (
                  <Button
                    key={action.status}
                    size="sm"
                    variant={action.status === "cancelado" ? "outline" : "default"}
                    disabled={isPending}
                    onClick={() => void handleSetStatus(incident.id, action.status)}
                  >
                    {isPending ? "..." : action.label}
                  </Button>
                ))}
              </div>
            )}
            {rowError && <p className="text-[12px] text-destructive">{rowError}</p>}
          </div>
        );
      })}
    </div>
  );
}
