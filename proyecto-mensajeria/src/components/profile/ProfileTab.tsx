import { useState } from "react";
import type { ReactNode } from "react";
import { ProfileScreen, type ProfileSubscreen } from "@/components/profile/ProfileScreen";
import { SecurityScreen } from "@/components/profile/SecurityScreen";
import { PrivacyScreen } from "@/components/profile/PrivacyScreen";
import { NotificationsScreen } from "@/components/profile/NotificationsScreen";
import { DeviceScreen } from "@/components/profile/DeviceScreen";
import { useProfile } from "@/hooks/useProfile";
import { useDevice } from "@/hooks/useDevice";

/** Pestaña Perfil/Ajustes: alterna entre la pantalla principal y sus subpantallas. */
export function ProfileTab({ tabBar }: { tabBar: ReactNode }) {
  const controller = useProfile();
  const deviceController = useDevice();
  const [subscreen, setSubscreen] = useState<ProfileSubscreen | null>(null);
  const closeSubscreen = () => setSubscreen(null);

  if (subscreen === "security")
    return <SecurityScreen controller={controller} onBack={closeSubscreen} />;
  if (subscreen === "privacy")
    return <PrivacyScreen controller={controller} onBack={closeSubscreen} />;
  if (subscreen === "notifications")
    return <NotificationsScreen controller={controller} onBack={closeSubscreen} />;
  if (subscreen === "device")
    return <DeviceScreen controller={deviceController} onBack={closeSubscreen} />;

  return <ProfileScreen controller={controller} tabBar={tabBar} onOpenSubscreen={setSubscreen} />;
}

