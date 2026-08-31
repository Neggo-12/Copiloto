import { DetailScreen } from "@/components/shared/DetailScreen";
import { SettingsSection, ToggleRow } from "@/components/shared/SettingsList";
import type { ProfileController } from "@/hooks/useProfile";
import type { NotificationSettings } from "@/lib/domain/types";

const NOTIFICATION_CONTROLS: {
  key: keyof NotificationSettings;
  label: string;
  description: string;
}[] = [
  {
    key: "messages",
    label: "Mensajes nuevos",
    description: "Avisos cuando alguien te escribe o te envía una nota de voz.",
  },
  {
    key: "noteReminders",
    label: "Notas con recordatorio",
    description: "Avisos a la hora que elegiste en tus notas y tareas.",
  },
];

/** Subpantalla Notificaciones: interruptor maestro del navegador + interruptores por tipo de aviso. */
export function NotificationsScreen({
  controller,
  onBack,
}: {
  controller: ProfileController;
  onBack: () => void;
}) {
  const { notificationSettings, setNotificationEnabled, pushStatus, togglePushSubscription } =
    controller;

  const pushDescription =
    pushStatus === "unsupported"
      ? "Este navegador no soporta notificaciones push."
      : pushStatus === "unconfigured"
        ? "Todavía no está configurada la llave pública (VITE_VAPID_PUBLIC_KEY)."
        : pushStatus === "denied"
          ? "Bloqueaste las notificaciones para este sitio — actívalas desde los ajustes del navegador."
          : pushStatus === "granted"
            ? "Vas a recibir avisos aunque no tengas la pestaña abierta."
            : "Actívalas para recibir avisos aunque no tengas la pestaña abierta.";

  return (
    <DetailScreen onBack={onBack} title="Notificaciones" className="overflow-y-auto">
      <div className="pb-8">
        <SettingsSection title="Este navegador">
          <ToggleRow
            label="Notificaciones del navegador"
            description={pushDescription}
            checked={pushStatus === "granted"}
            onChange={() => void togglePushSubscription()}
          />
        </SettingsSection>
        <SettingsSection
          title="Avisos"
          footnote="Solo aplican si activaste las notificaciones del navegador arriba."
        >
          {NOTIFICATION_CONTROLS.map((control) => (
            <ToggleRow
              key={control.key}
              label={control.label}
              description={control.description}
              checked={notificationSettings[control.key]}
              onChange={(enabled) => setNotificationEnabled(control.key, enabled)}
            />
          ))}
        </SettingsSection>
      </div>
    </DetailScreen>
  );
}
