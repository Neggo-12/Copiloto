import { supabase } from "@/lib/supabase/client";
import type { UserId } from "@/lib/domain/types";

const VAPID_PUBLIC_KEY: string | undefined = import.meta.env["VITE_VAPID_PUBLIC_KEY"];

export type PushSupportStatus = "unsupported" | "unconfigured" | "denied" | "granted" | "default";

/**
 * Estado real del navegador para Web Push (ADR-0033) — no hay nada que
 * simular acá, `Notification`/`serviceWorker`/`PushManager` son APIs del
 * navegador o no lo son.
 */
export function getPushSupportStatus(): PushSupportStatus {
  if (typeof window === "undefined") return "unsupported";
  if (
    !("serviceWorker" in navigator) ||
    !("PushManager" in window) ||
    !("Notification" in window)
  ) {
    return "unsupported";
  }
  if (!VAPID_PUBLIC_KEY) return "unconfigured";
  if (Notification.permission === "denied") return "denied";
  if (Notification.permission === "granted") return "granted";
  return "default";
}

/** VAPID llega en base64url; `PushManager.subscribe` pide un `Uint8Array` — conversión estándar de la spec de Web Push. */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from(rawData, (char) => char.charCodeAt(0));
}

/**
 * Pide permiso real al navegador y, si lo concede, registra el service
 * worker + suscribe a Web Push + guarda la suscripción real en Supabase
 * (`push_subscriptions`, dueño-únicamente por RLS). Devuelve el estado
 * resultante para que la UI lo refleje sin adivinar.
 */
export async function subscribeToPush(userId: UserId): Promise<PushSupportStatus> {
  const support = getPushSupportStatus();
  if (support === "unsupported" || support === "unconfigured") return support;

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "denied" : "default";

  const registration = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;

  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      // El tipo de lib.dom para `applicationServerKey` no acepta `Uint8Array`
      // directo en esta versión de TS aunque la spec real sí lo hace — cast
      // puntual, no una desviación del comportamiento real del navegador.
      applicationServerKey: urlBase64ToUint8Array(
        VAPID_PUBLIC_KEY as string,
      ) as unknown as BufferSource,
    }));

  const json = subscription.toJSON();
  const keys = json.keys as { p256dh?: string; auth?: string } | undefined;
  if (!json.endpoint || !keys?.["p256dh"] || !keys?.["auth"]) {
    console.error(
      "[push] subscribeToPush: suscripción del navegador sin endpoint/keys esperados",
      json,
    );
    return "granted"; // el permiso sí quedó concedido, aunque no se pudo guardar esta suscripción puntual
  }

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: userId,
      endpoint: json.endpoint,
      p256dh: keys["p256dh"],
      auth: keys["auth"],
    },
    { onConflict: "user_id,endpoint" },
  );
  if (error) {
    console.error("[push] subscribeToPush: no se pudo guardar la suscripción", error);
  }

  return "granted";
}

/** Da de baja la suscripción actual, tanto en el navegador como en Supabase (dueño-únicamente por RLS). */
export async function unsubscribeFromPush(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration("/sw.js");
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;

  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  if (error) {
    console.error(
      "[push] unsubscribeFromPush: no se pudo borrar la suscripción en Supabase",
      error,
    );
  }
}
