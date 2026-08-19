import type { ReactNode } from "react";
import { PhoneScreen } from "@/components/shared/PhoneScreen";
import { Ambulance, Bell } from "@/components/shared/icons";
import { formatChatTimestamp } from "@/lib/format";
import type { CopilotoRealtimeState } from "@/hooks/useCopilotoRealtime";

interface FeedItem {
  key: string;
  kind: "reminder" | "corridor";
  title: string;
  subtitle: string;
  at: string;
}

/**
 * Feed real de notificaciones de ESTA sesión (recordatorios disparados +
 * alertas de corredor recibidas por `useCopilotoRealtime`). No existe
 * todavía una tabla de notificaciones persistida en el backend — mostrar
 * historial de sesiones anteriores sería inventar datos, así que esta
 * pantalla es honesta sobre su alcance: solo lo que ha pasado desde que
 * abriste la app ahora.
 */
export function NotificacionesScreen({
  realtime,
  tabBar,
  subNav,
}: {
  realtime: CopilotoRealtimeState;
  tabBar: ReactNode;
  subNav?: ReactNode;
}) {
  const items: FeedItem[] = [
    ...realtime.reminderTriggers.map((t) => ({
      key: `reminder-${t.id}-${t.receivedAt}`,
      kind: "reminder" as const,
      title: t.message,
      subtitle: `Recordatorio cumplido · a ${t.distanceMeters}m`,
      at: t.receivedAt,
    })),
    ...realtime.alerts.map((a, index) => ({
      key: `corridor-${a.ambulanceDriverId}-${a.receivedAt}-${index}`,
      kind: "corridor" as const,
      title: a.message,
      subtitle: `Corredor de emergencia · a ${a.distanceMeters}m`,
      at: a.receivedAt,
    })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  return (
    <PhoneScreen title="Notificaciones" showThemeToggle className="justify-between">
      {subNav}
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain px-4 py-4">
        <p className="text-[12px] text-muted-foreground">
          Solo lo que ha pasado en esta sesión — todavía no hay historial guardado en el servidor.
        </p>

        {items.length === 0 && (
          <p className="px-1 py-8 text-center text-[14px] text-muted-foreground">
            Sin notificaciones todavía.
          </p>
        )}

        {items.map((item) => (
          <div
            key={item.key}
            className="flex items-start gap-3 rounded-2xl border border-border bg-card p-3"
          >
            <span
              className={`mt-0.5 grid size-9 shrink-0 place-items-center rounded-full ${
                item.kind === "corridor"
                  ? "bg-destructive/15 text-destructive"
                  : "bg-primary/10 text-primary"
              }`}
            >
              {item.kind === "corridor" ? (
                <Ambulance className="size-4" />
              ) : (
                <Bell className="size-4" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-medium">{item.title}</p>
              <p className="text-[12px] text-muted-foreground">{item.subtitle}</p>
            </div>
            <span className="shrink-0 text-[11px] text-muted-foreground">
              {formatChatTimestamp(item.at)}
            </span>
          </div>
        ))}
      </div>
      {tabBar}
    </PhoneScreen>
  );
}
