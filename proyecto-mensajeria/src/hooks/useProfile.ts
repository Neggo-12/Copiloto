import { useCallback, useEffect, useState } from "react";
import * as profileActions from "@/lib/actions/profile";
import type { ProfilePatch, ProfileState } from "@/lib/actions/profile";
import {
  getPushSupportStatus,
  subscribeToPush,
  unsubscribeFromPush,
  type PushSupportStatus,
} from "@/lib/actions/push";
import { MOCK_DEVICES } from "@/lib/domain/mock-data";
import type {
  ConnectedDevice,
  DeviceId,
  NotificationSettings,
  PrivacyAudience,
  PrivacySettings,
  UserProfile,
} from "@/lib/domain/types";
import { useAppStore } from "@/store/AppStore";

const INITIAL_STATE: ProfileState = {
  devices: MOCK_DEVICES,
  privacySettings: profileActions.DEFAULT_PRIVACY_SETTINGS,
  notificationSettings: profileActions.DEFAULT_NOTIFICATION_SETTINGS,
  securitySettings: profileActions.DEFAULT_SECURITY_SETTINGS,
};

export interface ProfileController {
  state: ProfileState;
  currentUser: UserProfile | null;
  devices: ConnectedDevice[];
  privacySettings: PrivacySettings;
  notificationSettings: NotificationSettings;
  twoStepVerificationEnabled: boolean;
  /** Nombre visible / "acerca de" — optimista local + guardado real en `profiles` (ADR-0028). */
  updateProfile: (patch: ProfilePatch) => void;
  /** Foto de perfil real: sube el archivo a Storage y guarda la URL pública (ADR-0028). */
  updateAvatar: (file: File) => Promise<void>;
  revokeDevice: (deviceId: DeviceId) => void;
  setTwoStepVerification: (enabled: boolean) => void;
  setPrivacyAudience: (key: keyof PrivacySettings, audience: PrivacyAudience) => void;
  /** Optimista local + guardado real en `profiles.notification_settings` (ADR-0033). */
  setNotificationEnabled: (key: keyof NotificationSettings, enabled: boolean) => void;
  /** Estado real de permiso/soporte de Web Push en este navegador (ADR-0033) — no hay nada simulado acá. */
  pushStatus: PushSupportStatus;
  /** Pide permiso real y suscribe (o da de baja) este navegador a Web Push. */
  togglePushSubscription: () => Promise<void>;
  signOut: () => void;
}

/**
 * Controlador de la pestaña Perfil/Ajustes: cada acción aislada de
 * `profile.ts` queda vinculada al estado local de la sesión. Desde
 * ADR-0028, nombre/"acerca de"/foto son reales (`profiles` + bucket
 * `avatars`) — antes se perdían al recargar, ver ese ADR para el detalle.
 */
export function useProfile(): ProfileController {
  const { currentUser, updateCurrentUser, signOut } = useAppStore();
  const [state, setState] = useState<ProfileState>(INITIAL_STATE);
  const [pushStatus, setPushStatus] = useState<PushSupportStatus>(() => getPushSupportStatus());

  // Hidrata la preferencia real de notificaciones (antes quedaba siempre en
  // el default en memoria, ver comentario de `fetchNotificationSettingsRemote`).
  useEffect(() => {
    const userId = currentUser?.id;
    if (!userId) return;
    let cancelled = false;
    profileActions.fetchNotificationSettingsRemote(userId).then((settings) => {
      if (cancelled || !settings) return;
      setState((prev) => ({ ...prev, notificationSettings: settings }));
    });
    return () => {
      cancelled = true;
    };
  }, [currentUser?.id]);

  const updateProfile = useCallback(
    (patch: ProfilePatch) => {
      // Optimista primero (misma UI de siempre), guardado real disparado
      // aparte — mismo patrón de useChats.ts (reconcileSentMessage etc.):
      // no bloquear la UI esperando la red, pero sí persistir de verdad.
      updateCurrentUser((user) => profileActions.applyProfilePatch(user, patch));
      const userId = currentUser?.id;
      if (!userId) return;
      const { displayName, about } = patch;
      if (displayName === undefined && about === undefined) return;
      void profileActions.updateProfileRemote(userId, {
        ...(displayName !== undefined ? { displayName } : {}),
        ...(about !== undefined ? { about } : {}),
      });
    },
    [updateCurrentUser, currentUser?.id],
  );

  const updateAvatar = useCallback(
    async (file: File) => {
      const userId = currentUser?.id;
      if (!userId) return;
      // Vista previa inmediata con el archivo real recién elegido — se
      // reemplaza por la URL pública real apenas termine de subirse.
      const previewUrl = URL.createObjectURL(file);
      updateCurrentUser((user) =>
        profileActions.applyProfilePatch(user, { avatarUrl: previewUrl }),
      );
      const publicUrl = await profileActions.uploadAndSaveAvatar(userId, file);
      if (publicUrl) {
        updateCurrentUser((user) =>
          profileActions.applyProfilePatch(user, { avatarUrl: publicUrl }),
        );
      }
    },
    [updateCurrentUser, currentUser?.id],
  );

  const revokeDevice = useCallback((deviceId: DeviceId) => {
    setState((prev) => profileActions.revokeDevice(prev, deviceId));
  }, []);

  const setTwoStepVerification = useCallback((enabled: boolean) => {
    setState((prev) => profileActions.setTwoStepVerification(prev, enabled));
  }, []);

  const setPrivacyAudience = useCallback(
    (key: keyof PrivacySettings, audience: PrivacyAudience) => {
      setState((prev) => profileActions.setPrivacyAudience(prev, key, audience));
    },
    [],
  );

  const setNotificationEnabled = useCallback(
    (key: keyof NotificationSettings, enabled: boolean) => {
      // Optimista primero, igual que `updateProfile` — el guardado real no
      // debe bloquear el interruptor de la UI.
      let nextSettings: NotificationSettings | null = null;
      setState((prev) => {
        const next = profileActions.setNotificationEnabled(prev, key, enabled);
        nextSettings = next.notificationSettings;
        return next;
      });
      const userId = currentUser?.id;
      if (!userId || !nextSettings) return;
      void profileActions.updateNotificationSettingsRemote(userId, nextSettings);
    },
    [currentUser?.id],
  );

  const togglePushSubscription = useCallback(async () => {
    const userId = currentUser?.id;
    if (!userId) return;
    if (pushStatus === "granted") {
      await unsubscribeFromPush();
      setPushStatus(getPushSupportStatus());
      return;
    }
    const result = await subscribeToPush(userId);
    setPushStatus(result);
  }, [currentUser?.id, pushStatus]);

  return {
    state,
    currentUser,
    devices: state.devices,
    privacySettings: state.privacySettings,
    notificationSettings: state.notificationSettings,
    twoStepVerificationEnabled: state.securitySettings.twoStepVerificationEnabled,
    updateProfile,
    updateAvatar,
    revokeDevice,
    setTwoStepVerification,
    setPrivacyAudience,
    setNotificationEnabled,
    pushStatus,
    togglePushSubscription,
    signOut,
  };
}
