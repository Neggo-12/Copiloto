import type { PermissionKey, PermissionStatus } from "@/lib/domain/types";

export interface PermissionCopy {
  key: PermissionKey;
  title: string;
  reason: string;
  allowLabel: string;
}

/** Copy de cada pantalla de permisos (una por una, con su justificación). */
export const PERMISSION_SEQUENCE: PermissionCopy[] = [
  {
    key: "contacts",
    title: "Contactos",
    reason: "Usamos tus contactos solo para mostrarte quién de tus conocidos ya está en la app.",
    allowLabel: "Permitir contactos",
  },
  {
    key: "notifications",
    title: "Notificaciones",
    reason: "Te avisamos cuando llega un mensaje nuevo o un recordatorio de tus notas.",
    allowLabel: "Permitir notificaciones",
  },
  {
    key: "microphone",
    title: "Micrófono",
    reason: "Necesario para grabar notas de voz en chats y en tu libreta personal.",
    allowLabel: "Permitir micrófono",
  },
  {
    key: "camera",
    title: "Cámara",
    reason: "Para tomar fotos y enviarlas en la conversación sin salir de la app.",
    allowLabel: "Permitir cámara",
  },
];

/**
 * Solicitud de permiso nativo. Fase 1: simulada.
 * Fase 2: se reemplaza por los plugins de Capacitor manteniendo esta firma.
 */
export async function requestNativePermission(
  key: PermissionKey,
  decision: "grant" | "deny",
): Promise<{ key: PermissionKey; status: PermissionStatus }> {
  await new Promise((resolve) => setTimeout(resolve, 350));
  return { key, status: decision === "grant" ? "granted" : "denied" };
}
