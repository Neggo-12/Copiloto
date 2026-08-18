/**
 * Acciones aisladas y reutilizables del perfil y los ajustes.
 * Igual que `chats.ts`, `notes.ts` y `contacts.ts`: funciones puras sobre
 * `ProfileState`, listas para conectarse al backend real sin cambiar firmas.
 */
import type {
  ConnectedDevice,
  DeviceId,
  NotificationSettings,
  PrivacyAudience,
  PrivacySettings,
  SecuritySettings,
  UserProfile,
} from "@/lib/domain/types";

export interface ProfileState {
  devices: ConnectedDevice[];
  privacySettings: PrivacySettings;
  notificationSettings: NotificationSettings;
  securitySettings: SecuritySettings;
}

/** Campos del perfil editables directamente en la pestaña Perfil/Ajustes. */
export interface ProfilePatch {
  displayName?: string;
  about?: string;
  avatarUrl?: string | null;
}

export const ABOUT_MAX_LENGTH = 140;
export const DISPLAY_NAME_MIN_LENGTH = 2;

export const DEFAULT_PRIVACY_SETTINGS: PrivacySettings = {
  profilePhotoVisibility: "contacts",
  aboutVisibility: "contacts",
  lastSeenVisibility: "contacts",
};

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  messages: true,
  voiceNotes: true,
  noteReminders: true,
  calls: true,
};

export const DEFAULT_SECURITY_SETTINGS: SecuritySettings = {
  twoStepVerificationEnabled: false,
};

export const PRIVACY_AUDIENCE_OPTIONS: { value: PrivacyAudience; label: string }[] = [
  { value: "everyone", label: "Todos" },
  { value: "contacts", label: "Mis contactos" },
  { value: "nobody", label: "Nadie" },
];

export function audienceLabel(audience: PrivacyAudience): string {
  return PRIVACY_AUDIENCE_OPTIONS.find((option) => option.value === audience)?.label ?? "";
}

/** Valida el nombre visible antes de guardar el perfil. */
export function isValidDisplayName(displayName: string): boolean {
  return displayName.trim().length >= DISPLAY_NAME_MIN_LENGTH;
}

/** Aplica los cambios editables al perfil, normalizando espacios y límites. */
export function applyProfilePatch(user: UserProfile, patch: ProfilePatch): UserProfile {
  const next: UserProfile = { ...user };
  if (patch.displayName !== undefined) {
    const displayName = patch.displayName.trim();
    if (isValidDisplayName(displayName)) next.displayName = displayName;
  }
  if (patch.about !== undefined) next.about = patch.about.slice(0, ABOUT_MAX_LENGTH).trim();
  if (patch.avatarUrl !== undefined) next.avatarUrl = patch.avatarUrl;
  return next;
}

/** El celular y el correo solo cambian pasando de nuevo por verificación. */
export const REVERIFICATION_NOTICE =
  "Para cambiar tu número o tu correo necesitas verificarlos de nuevo con un código.";

/** Cierra la sesión de un dispositivo puntual (nunca el dispositivo actual). */
export function revokeDevice(state: ProfileState, deviceId: DeviceId): ProfileState {
  return {
    ...state,
    devices: state.devices.filter(
      (device) => device.id !== deviceId || device.isCurrentDevice,
    ),
  };
}

export function setTwoStepVerification(state: ProfileState, enabled: boolean): ProfileState {
  return { ...state, securitySettings: { twoStepVerificationEnabled: enabled } };
}

export function setPrivacyAudience(
  state: ProfileState,
  key: keyof PrivacySettings,
  audience: PrivacyAudience,
): ProfileState {
  return { ...state, privacySettings: { ...state.privacySettings, [key]: audience } };
}

export function setNotificationEnabled(
  state: ProfileState,
  key: keyof NotificationSettings,
  enabled: boolean,
): ProfileState {
  return { ...state, notificationSettings: { ...state.notificationSettings, [key]: enabled } };
}

/** Etiqueta legible del dispositivo para la lista de sesiones. */
export function describeDevice(device: ConnectedDevice): string {
  const platform =
    device.platform === "ios" ? "iPhone" : device.platform === "android" ? "Android" : "Web";
  const when = new Date(device.lastActiveAt).toLocaleString("es-CO", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  return device.isCurrentDevice ? `${platform} · Este dispositivo` : `${platform} · ${when}`;
}
