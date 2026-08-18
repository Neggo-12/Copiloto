import { useCallback, useState } from "react";
import * as profileActions from "@/lib/actions/profile";
import type { ProfilePatch, ProfileState } from "@/lib/actions/profile";
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
  updateProfile: (patch: ProfilePatch) => void;
  revokeDevice: (deviceId: DeviceId) => void;
  setTwoStepVerification: (enabled: boolean) => void;
  setPrivacyAudience: (key: keyof PrivacySettings, audience: PrivacyAudience) => void;
  setNotificationEnabled: (key: keyof NotificationSettings, enabled: boolean) => void;
  signOut: () => void;
}

/**
 * Controlador de la pestaña Perfil/Ajustes: cada acción aislada de
 * `profile.ts` queda vinculada al estado local de la sesión simulada.
 */
export function useProfile(): ProfileController {
  const { currentUser, updateCurrentUser, signOut } = useAppStore();
  const [state, setState] = useState<ProfileState>(INITIAL_STATE);

  const updateProfile = useCallback(
    (patch: ProfilePatch) => {
      updateCurrentUser((user) => profileActions.applyProfilePatch(user, patch));
    },
    [updateCurrentUser],
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
      setState((prev) => profileActions.setNotificationEnabled(prev, key, enabled));
    },
    [],
  );

  return {
    state,
    currentUser,
    devices: state.devices,
    privacySettings: state.privacySettings,
    notificationSettings: state.notificationSettings,
    twoStepVerificationEnabled: state.securitySettings.twoStepVerificationEnabled,
    updateProfile,
    revokeDevice,
    setTwoStepVerification,
    setPrivacyAudience,
    setNotificationEnabled,
    signOut,
  };
}
