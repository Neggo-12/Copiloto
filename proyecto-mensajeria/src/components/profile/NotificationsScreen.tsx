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

/** Subpantalla Notificaciones: interruptores por tipo de aviso. */
export function NotificationsScreen({
  controller,
  onBack,
}: {
  controller: ProfileController;
  onBack: () => void;
}) {
  const { notificationSettings, setNotificationEnabled } = controller;

  return (
    <DetailScreen onBack={onBack} title="Notificaciones" className="overflow-y-auto">
      <div className="pb-8">
        <SettingsSection title="Avisos">
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
