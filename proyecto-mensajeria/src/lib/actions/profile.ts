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
  UserId,
  UserProfile,
} from "@/lib/domain/types";
import { supabase } from "@/lib/supabase/client";

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

/* ------------------------------------------------------------------ */
/* Backend real: persistencia del perfil (`profiles`, ADR-0028)         */
/*                                                                      */
/* Antes `updateCurrentUser` (useProfile.ts/AppStore.tsx) solo tocaba   */
/* el estado en memoria de la sesión — cualquier edición de nombre/     */
/* "acerca de"/foto se perdía al recargar. RLS `profiles_update_self`   */
/* ya existía desde el esquema original (ADR-0001), solo faltaba usarla.*/
/* ------------------------------------------------------------------ */

/** Guarda nombre/"acerca de" reales en `profiles` — RLS ya exige `id = auth.uid()`. */
export async function updateProfileRemote(
  userId: UserId,
  patch: { displayName?: string; about?: string },
): Promise<boolean> {
  const update: Record<string, string> = {};
  if (patch.displayName !== undefined) update["display_name"] = patch.displayName;
  if (patch.about !== undefined) update["about"] = patch.about;
  if (Object.keys(update).length === 0) return true;

  const { error } = await supabase.from("profiles").update(update).eq("id", userId);
  if (error) {
    console.error("[profile] updateProfileRemote: no se pudo guardar", error);
    return false;
  }
  return true;
}

/**
 * Sube una foto de perfil real al bucket público `avatars` (ya existía
 * desde ADR-0001, RLS `avatars_owner_write`: solo a la carpeta
 * `{auth.uid()}/...`) y guarda la URL pública en `profiles.avatar_url`.
 * Devuelve la URL pública real, o `null` si algo falló.
 */
export async function uploadAndSaveAvatar(userId: UserId, file: File): Promise<string | null> {
  const extension = file.name.split(".").pop() ?? "jpg";
  const path = `${userId}/${crypto.randomUUID()}.${extension}`;
  const { error: uploadError } = await supabase.storage
    .from("avatars")
    .upload(path, file, { contentType: file.type || "image/jpeg" });
  if (uploadError) {
    console.error("[profile] uploadAndSaveAvatar: no se pudo subir la foto", uploadError);
    return null;
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from("avatars").getPublicUrl(path);

  const { error: patchError } = await supabase
    .from("profiles")
    .update({ avatar_url: publicUrl })
    .eq("id", userId);
  if (patchError) {
    console.error("[profile] uploadAndSaveAvatar: no se pudo guardar la URL", patchError);
    return null;
  }
  return publicUrl;
}

/**
 * Trae la preferencia real de notificaciones (`profiles.notification_settings`,
 * jsonb — ADR-0033). Antes de esto, `NotificationsScreen` solo tocaba estado
 * en memoria de la sesión: los interruptores se "olvidaban" al recargar,
 * mismo síntoma que tenía el nombre/"acerca de" antes de ADR-0028.
 */
export async function fetchNotificationSettingsRemote(
  userId: UserId,
): Promise<NotificationSettings | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("notification_settings")
    .eq("id", userId)
    .maybeSingle();
  if (error || !data) {
    if (error) console.error("[profile] fetchNotificationSettingsRemote: no se pudo leer", error);
    return null;
  }
  return (data.notification_settings as NotificationSettings | null) ?? null;
}

/** Guarda la preferencia real de notificaciones — RLS ya exige `id = auth.uid()` (misma política que nombre/"acerca de"). */
export async function updateNotificationSettingsRemote(
  userId: UserId,
  settings: NotificationSettings,
): Promise<boolean> {
  const { error } = await supabase
    .from("profiles")
    .update({ notification_settings: settings })
    .eq("id", userId);
  if (error) {
    console.error("[profile] updateNotificationSettingsRemote: no se pudo guardar", error);
    return false;
  }
  return true;
}

/**
 * Marca "visto por última vez ahora" real (`profiles.last_seen_at`, ADR-0029)
 * — mismo patrón de auto-guardado silencioso que `updateProfileRemote`, sin
 * bloquear ni avisar a la UI si falla (no es crítico, se reintenta solo en
 * el próximo heartbeat de `useChats.ts`).
 */
export async function touchLastSeen(userId: UserId): Promise<void> {
  const { error } = await supabase
    .from("profiles")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", userId);
  if (error) {
    console.error("[profile] touchLastSeen: no se pudo actualizar", error);
  }
}

/** El celular y el correo solo cambian pasando de nuevo por verificación. */
export const REVERIFICATION_NOTICE =
  "Para cambiar tu número o tu correo necesitas verificarlos de nuevo con un código.";

/** Cierra la sesión de un dispositivo puntual (nunca el dispositivo actual). */
export function revokeDevice(state: ProfileState, deviceId: DeviceId): ProfileState {
  return {
    ...state,
    devices: state.devices.filter((device) => device.id !== deviceId || device.isCurrentDevice),
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
