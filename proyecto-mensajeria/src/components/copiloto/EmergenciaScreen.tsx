import type { ReactNode } from "react";
import { PhoneScreen } from "@/components/shared/PhoneScreen";
import { Badge } from "@/components/ui/badge";
import { Ambulance, Car, Helmet, Wifi, WifiOff } from "@/components/shared/icons";
import { formatClock } from "@/lib/format";
import type { CopilotoRealtimeState } from "@/hooks/useCopilotoRealtime";

const CHANNEL_LABEL: Record<string, { label: string; icon: typeof Car }> = {
  visual_audio: { label: "Visual + sonido (carro)", icon: Car },
  voice_priority: { label: "Prioridad de voz (moto)", icon: Helmet },
  default: { label: "Aviso general", icon: Ambulance },
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
  const { connectionStatus, connectionError, geoStatus, alerts, ambulanceView } = realtime;

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
            {ambulanceView.data?.hasActiveRoute && ambulanceView.data.candidates.length === 0 && (
              <p className="rounded-xl bg-muted px-3 py-2 text-[13px] text-muted-foreground">
                Ruta activa, sin candidatos cerca por ahora.
              </p>
            )}
            {ambulanceView.data?.candidates.map((candidate) => (
              <div
                key={candidate.userId}
                className="flex items-center justify-between rounded-2xl border border-border bg-card px-3 py-2"
              >
                <span className="text-[13px] text-muted-foreground">
                  Usuario {candidate.userId.slice(0, 8)}…
                </span>
                <Badge variant="outline">{candidate.distanceMeters}m</Badge>
              </div>
            ))}
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
              return (
                <div
                  key={`${alert.ambulanceDriverId}-${alert.receivedAt}-${index}`}
                  className="flex items-start gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-3"
                >
                  <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-destructive/15 text-destructive">
                    <Ambulance className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-medium">{alert.message}</p>
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
          </>
        )}
      </div>
      {tabBar}
    </PhoneScreen>
  );
}
