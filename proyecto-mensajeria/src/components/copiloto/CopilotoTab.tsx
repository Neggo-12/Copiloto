import { useState } from "react";
import type { ReactNode } from "react";
import { useDrivingMode } from "@/hooks/useDrivingMode";
import { useCopilotoRealtimeContext } from "@/hooks/useCopilotoRealtime";
import { useGeminiVoiceSession } from "@/hooks/useGeminiVoiceSession";
import { ModoManejoScreen } from "./ModoManejoScreen";
import { EmergenciaScreen } from "./EmergenciaScreen";
import { NotificacionesScreen } from "./NotificacionesScreen";
import { AsistenteVozScreen } from "./AsistenteVozScreen";

export type CopilotoSubTab = "modo" | "emergencia" | "notificaciones" | "voz";

// Bug real reportado por el fundador (2026-09-03, ver docs/decisions/README.md
// decisión (35)): esta sub-nav mostraba una pestaña "Admin" en TODAS las
// cuentas (cualquier usuario de prueba la veía y, al tocarla, el backend le
// respondía "Sin acceso" — confuso e indeseado, ese panel es exclusivo del
// fundador). El panel de administrador ahora vive completamente aparte, en
// su propio dashboard con login propio (`/admin`, ver
// `src/components/admin/AdminDashboard.tsx`) — ya no es una pestaña más
// dentro de la app normal.
const SUB_TABS: { key: CopilotoSubTab; label: string }[] = [
  { key: "modo", label: "Modo" },
  { key: "emergencia", label: "Emergencia" },
  { key: "notificaciones", label: "Alertas" },
  { key: "voz", label: "Voz" },
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
  // Ya no se conecta aquí — `realtime` ahora vive en `CopilotoRealtimeProvider`
  // (montado en `MainShell`, ver `routes/index.tsx`) para que el socket de
  // `/location` y el GPS real sigan activos aunque el usuario cambie a
  // Chats/Notas/Contactos, no solo mientras está en esta pestaña (bug real
  // corregido 2026-09-02, ver el comentario de `CopilotoRealtimeProvider`
  // en `useCopilotoRealtime.tsx`).
  const realtime = useCopilotoRealtimeContext();
  // No conecta sola (a diferencia de `realtime`): abre micrófono real y una
  // sesión real de Gemini, solo cuando el usuario toca el botón en la
  // pantalla — mantenerla montada aquí (como las demás) es seguro porque no
  // hace nada hasta que se llame `start()`.
  const voiceSession = useGeminiVoiceSession();

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
    case "voz":
      return <AsistenteVozScreen controller={voiceSession} tabBar={tabBar} subNav={subNav} />;
  }
}
