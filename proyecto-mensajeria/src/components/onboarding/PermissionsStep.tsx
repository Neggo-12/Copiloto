import { useState } from "react";
import { Bell, Camera, Mic, Users } from "@/components/shared/icons";
import type { AppIcon } from "@/components/shared/icons";
import {
  PhoneScreen,
  PrimaryAction,
  ScreenFooter,
  SecondaryAction,
} from "@/components/shared/PhoneScreen";
import { PERMISSION_SEQUENCE, requestNativePermission } from "@/lib/actions/permissions";
import type { PermissionKey } from "@/lib/domain/types";
import { useAppStore } from "@/store/AppStore";

const PERMISSION_ICONS: Record<PermissionKey, AppIcon> = {
  contacts: Users,
  notifications: Bell,
  microphone: Mic,
  camera: Camera,
};

export function PermissionsStep({
  onBack,
  onFinish,
}: {
  onBack: () => void;
  /** Puede lanzar (ej. si falla guardar el perfil) — ver el try/catch abajo. */
  onFinish: () => Promise<void>;
}) {
  const { setPermissionStatus } = useAppStore();
  const [index, setIndex] = useState(0);
  const [isBusy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const permission = PERMISSION_SEQUENCE[index]!;
  const Icon = PERMISSION_ICONS[permission.key];
  const isLast = index === PERMISSION_SEQUENCE.length - 1;

  const advance = async () => {
    if (!isLast) {
      setIndex((value) => value + 1);
      return;
    }
    // Último permiso: aquí es donde se guarda el perfil de verdad
    // (completeOnboarding, vía onFinish). Si falla, se muestra el motivo en
    // vez de dejar al usuario atascado sin ninguna explicación — ver
    // TECHNICAL_DEBT.md §11.
    try {
      await onFinish();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "No se pudo completar el registro. Intenta de nuevo.",
      );
    }
  };

  const resolvePermission = async (decision: "grant" | "deny") => {
    setBusy(true);
    setErrorMessage(null);
    const result = await requestNativePermission(permission.key, decision);
    setPermissionStatus(result.key, result.status);
    await advance();
    setBusy(false);
  };

  return (
    <PhoneScreen
      title={`Permisos ${index + 1} de ${PERMISSION_SEQUENCE.length}`}
      onBack={() => (index === 0 ? onBack() : setIndex((value) => value - 1))}
    >
      <div className="flex shrink-0 gap-1.5 px-6 pt-4">
        {PERMISSION_SEQUENCE.map((item, itemIndex) => (
          <span
            key={item.key}
            className={`h-1 flex-1 rounded-full ${
              itemIndex <= index ? "bg-primary" : "bg-border-strong"
            }`}
          />
        ))}
      </div>

      <div key={permission.key} className="screen-enter flex flex-1 flex-col justify-center px-7">
        <div className="grid size-16 place-items-center rounded-3xl border border-border bg-accent">
          <Icon className="size-8 text-accent-foreground" />
        </div>
        <h2 className="mt-7 text-[30px] leading-tight font-bold tracking-tight">
          {permission.title}
        </h2>
        <p className="mt-3 text-[17px] leading-relaxed text-muted-foreground">
          {permission.reason}
        </p>
        <p className="mt-6 text-[13px] leading-relaxed text-muted-foreground">
          Puedes cambiar este permiso en cualquier momento desde Ajustes.
        </p>

        {errorMessage && <p className="mt-4 text-[13px] text-destructive">{errorMessage}</p>}
      </div>

      <ScreenFooter>
        <PrimaryAction onClick={() => resolvePermission("grant")} loading={isBusy}>
          {permission.allowLabel}
        </PrimaryAction>
        <SecondaryAction onClick={() => resolvePermission("deny")}>Ahora no</SecondaryAction>
      </ScreenFooter>
    </PhoneScreen>
  );
}
