import { useState } from "react";
import type { ReactNode } from "react";
import { useDrivingMode } from "@/hooks/useDrivingMode";
import { useCopilotoRealtime } from "@/hooks/useCopilotoRealtime";
import { ModoManejoScreen } from "./ModoManejoScreen";
import { EmergenciaScreen } from "./EmergenciaScreen";
import { NotificacionesScreen } from "./NotificacionesScreen";

export type CopilotoSubTab = "modo" | "emergencia" | "notificaciones";

const SUB_TABS: { key: CopilotoSubTab; label: string }[] = [
  { key: "modo", label: "Modo" },
  { key: "emergencia", label: "Emergencia" },
  { key: "notificaciones", label: "Alertas" },
];

/**
 * Pestaña "Copiloto": agrupa las capacidades reales del backend NestJS
 * (Modo de manejo, Emergencia, Notificaciones) detrás de un selector interno
 * — la barra inferior principal ya tiene sus 4 pestañas de mensajería, así
 * que esta vive como una quinta pestaña con su propia sub-navegación (misma
 * idea que ya usa Perfil para sus subpantallas, pero como pestañas
 * horizontales en vez de navegación a otra pantalla).
 *
 * "Recordatorios" ya no vive aquí — se unificó con "Notas" en una sola
 * sección (pestaña principal "Notas"), ver ADR-0023.
 */
export function CopilotoTab({ tabBar }: { tabBar: ReactNode }) {
  const [subTab, setSubTab] = useState<CopilotoSubTab>("modo");
  const drivingMode = useDrivingMode();
  const realtime = useCopilotoRealtime();

  const subNav = (
    <div className="flex shrink-0 gap-1.5 overflow-x-auto border-b border-border/70 bg-surface/60 px-3 py-2">
      {SUB_TABS.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => setSubTab(tab.key)}
          aria-pressed={subTab === tab.key}
          className={`press shrink-0 rounded-full border px-3 py-1.5 text-[13px] font-medium ${
            subTab === tab.key
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border text-muted-foreground"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );

  switch (subTab) {
    case "modo":
      return <ModoManejoScreen controller={drivingMode} tabBar={tabBar} subNav={subNav} />;
    case "emergencia":
      return <EmergenciaScreen realtime={realtime} tabBar={tabBar} subNav={subNav} />;
    case "notificaciones":
      return <NotificacionesScreen realtime={realtime} tabBar={tabBar} subNav={subNav} />;
  }
}
