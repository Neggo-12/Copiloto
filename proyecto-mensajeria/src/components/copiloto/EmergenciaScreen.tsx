import { useState } from "react";
import type { ReactNode } from "react";
import { PhoneScreen } from "@/components/shared/PhoneScreen";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Ambulance, Car, Helmet, ShieldCheck, Wifi, WifiOff } from "@/components/shared/icons";
import { formatClock } from "@/lib/format";
import type { CopilotoRealtimeState, CorridorSeverity } from "@/hooks/useCopilotoRealtime";

const CHANNEL_LABEL: Record<string, { label: string; icon: typeof Car }> = {
  visual_audio: { label: "Visual + sonido (carro)", icon: Car },
  voice_priority: { label: "Prioridad de voz (moto)", icon: Helmet },
  default: { label: "Aviso general", icon: Ambulance },
};

/** Espejo de la lógica de `severityFor` en el backend (ADR-0021) — relativa al buffer dinámico del momento, no a metros fijos. */
const SEVERITY_LABEL: Record<
  CorridorSeverity,
  { label: string; badgeVariant: "destructive" | "secondary" | "outline"; className?: string }
> = {
  critical: { label: "Crítico", badgeVariant: "destructive" },
  warning: {
    label: "Atención",
    badgeVariant: "secondary",
    className: "text-amber-700 dark:text-amber-400",
  },
  info: { label: "Informativo", badgeVariant: "outline" },
};

/**
 * Pantalla real de "Emergencia / Corredor de ambulancia" — conectada al
 * canal `/location` real (ver `useCopilotoRealtime`). Dos vistas según el
 * rol real del usuario autenticado (nunca decidido por el cliente):
 * conductor de ambulancia verificado (ADR-0012/0013) ve candidatos reales
 * del corredor; cualquier otro usuario ve las alertas reales que le lleguen
 * mientras reporta su ubicación (ADR-0017, canal recomendado por Modo de
 * manejo).
 */
export function EmergenciaScreen({
  realtime,
  tabBar,
  subNav,
}: {
  realtime: CopilotoRealtimeState;
  tabBar: ReactNode;
  subNav?: ReactNode;
}) {
  const { connectionStatus, connectionError, geoStatus, alerts, closedNotices, ambulanceView, closeAmbulanceCorridor } =
    realtime;
  const [closing, setClosing] = useState<"completed" | "cancelled" | null>(null);
  const [closeError, setCloseError] = useState<string | null>(null);

  async function handleClose(reason: "completed" | "cancelled") {
    if (closing) return;
    setClosing(reason);
    setCloseError(null);
    try {
      await closeAmbulanceCorridor(reason);
    } catch (err) {
      setCloseError(err instanceof Error ? err.message : "No se pudo finalizar el traslado.");
    } finally {
      setClosing(null);
    }
  }

  return (
    <PhoneScreen title="Emergencia" showThemeToggle className="justify-between">
      {subNav}
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-4">
        <div className="flex items-center gap-2 rounded-2xl border border-border bg-card px-3 py-2 text-[13px]">
          {connectionStatus === "connected" ? (
            <Wifi className="size-4 text-emerald-500" />
          ) : (
            <WifiOff className="size-4 text-muted-foreground" />
          )}
          <span className="text-muted-foreground">
            {connectionStatus === "connected" &&
              "Conectado en tiempo real al corredor de emergencia."}
            {connectionStatus === "connecting" && "Conectando..."}
            {connectionStatus === "error" && (connectionError ?? "No se pudo conectar.")}
            {connectionStatus === "idle" && "Sin conectar."}
          </span>
        </div>

        {geoStatus === "denied" && (
          <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-[13px] text-amber-700 dark:text-amber-400">
            Sin permiso de ubicación — actívalo para que puedan avisarte si una ambulancia se
            acerca, y para que las ambulancias te vean si tú manejas una.
          </p>
        )}
        {geoStatus === "unsupported" && (
          <p className="rounded-xl bg-muted px-3 py-2 text-[13px] text-muted-foreground">
            Este navegador no soporta reportar ubicación.
          </p>
        )}

        {!ambulanceView.checked && (
          <p className="text-[13px] text-muted-foreground">Verificando tu rol...</p>
        )}

        {ambulanceView.checked && ambulanceView.isAmbulance && (
          <div className="space-y-2">
            <p className="flex items-center gap-2 text-[14px] font-medium">
              <Ambulance className="size-5 text-destructive" /> Vista de conductor de ambulancia
            </p>
            {!ambulanceView.data?.hasActiveRoute && (
              <p className="rounded-xl bg-muted px-3 py-2 text-[13px] text-muted-foreground">
                No tienes una ruta activa — arranca una en Navegación para ver candidatos reales
                aquí.
              </p>
            )}
            {ambulanceView.data?.hasActiveRoute && (
              <>
                <div className="flex gap-2">
                  <Button
                    variant="default"
                    size="sm"
                    className="flex-1"
                    disabled={closing !== null}
                    onClick={() => void handleClose("completed")}
                  >
                    {closing === "completed" ? "Finalizando…" : "Llegué / Finalizar"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    disabled={closing !== null}
                    onClick={() => void handleClose("cancelled")}
                  >
                    {closing === "cancelled" ? "Cancelando…" : "Cancelar traslado"}
                  </Button>
                </div>
                {closeError && (
                  <p className="rounded-xl bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
                    {closeError}
                  </p>
                )}
              </>
            )}
            {ambulanceView.data?.hasActiveRoute && ambulanceView.data.candidates.length === 0 && (
              <p className="rounded-xl bg-muted px-3 py-2 text-[13px] text-muted-foreground">
                Ruta activa, sin candidatos cerca por ahora.
              </p>
            )}
            {ambulanceView.data?.candidates.map((candidate) => {
              const severity = SEVERITY_LABEL[candidate.severity];
              return (
                <div
                  key={candidate.userId}
                  className="flex items-center justify-between rounded-2xl border border-border bg-card px-3 py-2"
                >
                  <span className="text-[13px] text-muted-foreground">
                    Usuario {candidate.userId.slice(0, 8)}…
                  </span>
                  <div className="flex items-center gap-1.5">
                    <Badge variant={severity.badgeVariant} className={severity.className}>
                      {severity.label}
                    </Badge>
                    <Badge variant="outline">{candidate.distanceMeters}m</Badge>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {ambulanceView.checked && !ambulanceView.isAmbulance && (
          <>
            <p className="text-[14px] font-medium">Alertas recibidas</p>
            {alerts.length === 0 && (
              <p className="rounded-xl bg-muted px-3 py-2 text-[13px] text-muted-foreground">
                Aún no ha llegado ninguna alerta real en esta sesión — aparecerán aquí en cuanto una
                ambulancia verificada se acerque mientras reportas tu ubicación.
              </p>
            )}
            {alerts.map((alert, index) => {
              const channel = CHANNEL_LABEL[alert.recommendedChannel] ?? CHANNEL_LABEL["default"]!;
              const Icon = channel.icon;
              const severity = SEVERITY_LABEL[alert.severity] ?? SEVERITY_LABEL.info;
              return (
                <div
                  key={`${alert.ambulanceDriverId}-${alert.receivedAt}-${index}`}
                  className="flex items-start gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-3"
                >
                  <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-destructive/15 text-destructive">
                    <Ambulance className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="text-[14px] font-medium">{alert.message}</p>
                      <Badge variant={severity.badgeVariant} className={severity.className}>
                        {severity.label}
                      </Badge>
                    </div>
                    <p className="text-[12px] text-muted-foreground">
                      A {alert.distanceMeters}m · {formatClock(alert.receivedAt)}
                    </p>
                    <p className="mt-1 flex items-center gap-1 text-[12px] text-primary">
                      <Icon className="size-3.5" /> {channel.label}
                    </p>
                  </div>
                </div>
              );
            })}
            {closedNotices.map((notice, index) => (
              <div
                key={`${notice.ambulanceDriverId}-${notice.receivedAt}-${index}`}
                className="flex items-center gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-3"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                  <ShieldCheck className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium">Ya pasó, gracias por facilitar el paso.</p>
                  <p className="text-[12px] text-muted-foreground">
                    {formatClock(notice.receivedAt)}
                    {notice.reason === "expired" && " · traslado finalizado"}
                  </p>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
      {tabBar}
    </PhoneScreen>
  );
}
