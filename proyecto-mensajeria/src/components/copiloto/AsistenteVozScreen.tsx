import type { ReactNode } from "react";
import { PhoneScreen } from "@/components/shared/PhoneScreen";
import { Mic, X, Spinner } from "@/components/shared/icons";
import type { GeminiVoiceController } from "@/hooks/useGeminiVoiceSession";

const STATUS_LABEL: Record<GeminiVoiceController["status"], string> = {
  idle: "Toca el micrófono para hablar con el asistente",
  connecting: "Conectando...",
  listening: "Escuchando — habla ahora",
  error: "Hubo un problema",
  closed: "Sesión cerrada",
};

/**
 * Pantalla real de asistente de voz (ADR-0034, segundo slice) — primera vez
 * que "Modo conducción" tiene un micrófono real conectado a Gemini Live,
 * no un mockup. Alcance honesto igual al del backend: solo texto/tools de
 * consulta reales por ahora; `activate_emergency_corridor` sigue sin poder
 * activarse por voz (la tool responde `needs_confirmation` y ahí se queda,
 * ver `GeminiLiveService`) — decisión de producto sin tomar todavía.
 *
 * Nunca se probó contra un micrófono real (recién construida) — primera
 * vez que se prueba es la prueba real, no antes.
 */
export function AsistenteVozScreen({
  controller,
  tabBar,
  subNav,
}: {
  controller: GeminiVoiceController;
  tabBar: ReactNode;
  subNav?: ReactNode;
}) {
  const { status, error, transcript, start, stop } = controller;
  const isActive = status === "connecting" || status === "listening";

  return (
    <PhoneScreen title="Asistente de voz" showThemeToggle className="justify-between">
      {subNav}
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 overflow-y-auto overscroll-contain px-6 py-4">
        <button
          type="button"
          onClick={() => void (isActive ? stop() : start())}
          aria-label={isActive ? "Detener asistente de voz" : "Hablar con el asistente"}
          className={`press grid size-24 shrink-0 place-items-center rounded-full transition-colors ${
            status === "listening"
              ? "bg-destructive text-destructive-foreground"
              : "bg-primary text-primary-foreground"
          }`}
        >
          {status === "connecting" ? (
            <Spinner className="size-9 animate-spin" />
          ) : isActive ? (
            <X className="size-9" />
          ) : (
            <Mic className="size-9" />
          )}
        </button>

        <p className="text-center text-[14px] text-muted-foreground">{STATUS_LABEL[status]}</p>

        {error && (
          <p className="w-full rounded-xl bg-destructive/10 px-3 py-2 text-center text-[13px] text-destructive">
            {error}
          </p>
        )}

        {transcript && (
          <div className="w-full rounded-2xl border border-border bg-card p-4">
            <p className="text-[13px] text-muted-foreground">Lo que dijo el asistente:</p>
            <p className="mt-1 text-[15px]">{transcript}</p>
          </div>
        )}

        <p className="text-center text-[12px] text-muted-foreground">
          Puede consultar tus vehículos, chats y recordatorios reales. Activar el corredor de
          emergencia por voz todavía no está permitido — pídelo y el asistente te dirá que lo
          confirmes desde la app.
        </p>
      </div>
      {tabBar}
    </PhoneScreen>
  );
}
