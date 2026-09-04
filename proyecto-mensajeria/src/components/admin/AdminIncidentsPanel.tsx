import { Badge } from "@/components/ui/badge";
import { MapPin, Mail as MailIcon, Phone as PhoneIcon } from "@/components/shared/icons";
import type { AdminEmergencyIncidentRow } from "@/hooks/useEmergencyAdmin";

const STATUS_LABEL: Record<AdminEmergencyIncidentRow["status"], string> = {
  creado: "Creado",
  recibido: "Recibido",
  en_atencion: "En atención",
  cancelado: "Cancelado",
  cerrado: "Cerrado",
};

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

/**
 * Sección "Incidentes — Llamar a la policía" del dashboard de `/admin`:
 * primera UI real para `GET /emergency/admin/incidents` (el endpoint ya
 * existía desde la decisión (34), pero no tenía pantalla propia todavía —
 * "lo normal que pueda ver" a lo que se refería el fundador). Cada fila ya
 * trae los datos REALES tomados al momento del incidente (nombre/teléfono/
 * correo, ubicación) — no hace falta unir contra `profiles` desde acá.
 */
export function AdminIncidentsPanel({ incidents }: { incidents: AdminEmergencyIncidentRow[] }) {
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
      {incidents.map((incident) => (
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
            <span className="flex items-center gap-1">
              <MapPin className="size-3.5" />
              {incident.latitude.toFixed(5)}, {incident.longitude.toFixed(5)}
            </span>
          </p>
          <p className="text-[11px] text-muted-foreground">
            {formatWhen(incident.createdAt)} · confianza {incident.confidenceLevel}
          </p>
        </div>
      ))}
    </div>
  );
}
