import { useState } from "react";
import { KeyRound, Laptop, LogOut, Smartphone } from "@/components/shared/icons";
import { DetailScreen } from "@/components/shared/DetailScreen";
import { SettingsSection, ToggleRow } from "@/components/shared/SettingsList";
import { ConfirmSheet } from "@/components/shared/ConfirmSheet";
import { describeDevice } from "@/lib/actions/profile";
import type { ProfileController } from "@/hooks/useProfile";
import type { DeviceId } from "@/lib/domain/types";

/** Subpantalla Seguridad: dispositivos conectados + verificación en dos pasos. */
export function SecurityScreen({
  controller,
  onBack,
}: {
  controller: ProfileController;
  onBack: () => void;
}) {
  const { devices, twoStepVerificationEnabled, revokeDevice, setTwoStepVerification } = controller;
  const [pendingDeviceId, setPendingDeviceId] = useState<DeviceId | null>(null);
  const pendingDevice = devices.find((device) => device.id === pendingDeviceId) ?? null;

  return (
    <DetailScreen onBack={onBack} title="Seguridad" className="overflow-y-auto">
      <div className="pb-8">
        <SettingsSection
          title="Verificación en dos pasos"
          footnote="Al activarla pediremos un código adicional cada vez que registres un dispositivo nuevo."
        >
          <ToggleRow
            label="Verificación en dos pasos"
            description={twoStepVerificationEnabled ? "Activada" : "Desactivada"}
            checked={twoStepVerificationEnabled}
            onChange={setTwoStepVerification}
          />
        </SettingsSection>

        <SettingsSection
          title="Dispositivos conectados"
          footnote="Si no reconoces un dispositivo, cierra su sesión de inmediato."
        >
          {devices.map((device) => {
            const Icon =
              device.platform === "web"
                ? Laptop
                : device.platform === "ios"
                  ? Smartphone
                  : KeyRound;
            return (
              <div key={device.id} className="flex items-center gap-3 px-4 py-3.5">
                <Icon className="size-5 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[16px] font-medium tracking-tight">
                    {device.deviceName}
                  </p>
                  <p className="mt-0.5 font-mono text-[12px] text-muted-foreground">
                    {describeDevice(device)}
                  </p>
                </div>
                {!device.isCurrentDevice && (
                  <button
                    type="button"
                    onClick={() => setPendingDeviceId(device.id)}
                    aria-label={`Cerrar sesión en ${device.deviceName}`}
                    className="press touch-target grid w-11 place-items-center rounded-xl text-destructive active:bg-secondary"
                  >
                    <LogOut className="size-5" />
                  </button>
                )}
              </div>
            );
          })}
        </SettingsSection>
      </div>

      <ConfirmSheet
        open={Boolean(pendingDevice)}
        title="¿Cerrar sesión en este dispositivo?"
        description={`${pendingDevice?.deviceName ?? "Este dispositivo"} dejará de tener acceso a tus chats.`}
        confirmLabel="Cerrar sesión en este dispositivo"
        onCancel={() => setPendingDeviceId(null)}
        onConfirm={() => {
          if (pendingDeviceId) revokeDevice(pendingDeviceId);
          setPendingDeviceId(null);
        }}
      />
    </DetailScreen>
  );
}
