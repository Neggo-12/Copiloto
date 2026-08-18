import { DetailScreen } from "@/components/shared/DetailScreen";
import { OptionPicker, SettingsSection } from "@/components/shared/SettingsList";
import { PRIVACY_AUDIENCE_OPTIONS } from "@/lib/actions/profile";
import type { ProfileController } from "@/hooks/useProfile";
import type { PrivacyAudience, PrivacySettings } from "@/lib/domain/types";

const PRIVACY_CONTROLS: {
  key: keyof PrivacySettings;
  label: string;
  description: string;
}[] = [
  {
    key: "profilePhotoVisibility",
    label: "Foto de perfil",
    description: "Quién puede ver tu foto.",
  },
  {
    key: "aboutVisibility",
    label: "Acerca de",
    description: "Quién puede leer tu descripción.",
  },
  {
    key: "lastSeenVisibility",
    label: "Última conexión",
    description: "Quién puede ver cuándo estuviste en línea.",
  },
];

/** Subpantalla Privacidad: quién puede ver cada dato del perfil. */
export function PrivacyScreen({
  controller,
  onBack,
}: {
  controller: ProfileController;
  onBack: () => void;
}) {
  const { privacySettings, setPrivacyAudience } = controller;

  return (
    <DetailScreen onBack={onBack} title="Privacidad" className="overflow-y-auto">
      <div className="pb-8">
        <SettingsSection
          title="Quién puede ver"
          footnote="Estas preferencias se guardan en tu dispositivo mientras la app está en modo demostración."
        >
          {PRIVACY_CONTROLS.map((control) => (
            <OptionPicker<PrivacyAudience>
              key={control.key}
              label={control.label}
              description={control.description}
              value={privacySettings[control.key]}
              options={PRIVACY_AUDIENCE_OPTIONS}
              onChange={(audience) => setPrivacyAudience(control.key, audience)}
            />
          ))}
        </SettingsSection>
      </div>
    </DetailScreen>
  );
}
