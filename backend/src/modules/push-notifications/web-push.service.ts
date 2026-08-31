import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { SupabaseClient } from "@supabase/supabase-js";
import webpush from "web-push";
import { SUPABASE_ADMIN_CLIENT } from "../../common/supabase/supabase.module";
import type { EnvConfig } from "../../config/env.validation";

export interface PushNotificationPayload {
  title: string;
  body: string;
  /** Datos libres que el service worker del front usa al abrir/enfocar una pestaña (ej. `{ url: "/notas" }`). */
  data?: Record<string, unknown>;
}

/**
 * Coincide con las llaves reales de `profiles.notification_settings`
 * (jsonb, ver esquema real en Supabase) — así `sendToUser` respeta la
 * preferencia que la persona ya configuró en Ajustes → Notificaciones, en
 * vez de mandar un push que no pidió.
 */
export type PushNotificationCategory = "messages" | "noteReminders" | "voiceNotes" | "calls";

/**
 * Adapter de Web Push (ADR-0033) — capa que aísla al resto del backend de
 * la librería `web-push` y de la tabla `push_subscriptions`, siguiendo la
 * misma regla de "proveedores detrás de adapters" que ya aplica a Google
 * Maps/OpenAI. Primer consumidor real: `NoteReminderProcessor` (antes solo
 * llegaba el aviso si había un socket conectado — ver comentario que
 * documentaba ese hueco, ahora resuelto para quien active notificaciones
 * en su navegador).
 *
 * Deliberadamente NO cubre notas por mensajería (Supabase-directo, sin
 * pasar por este backend, ver ADR-0018) ni alertas del Emergency Corridor
 * — ambos quedan fuera de alcance de este slice, ver ADR-0033.
 */
@Injectable()
export class WebPushService {
  private readonly logger = new Logger(WebPushService.name);
  private configured = false;

  constructor(
    config: ConfigService<EnvConfig, true>,
    @Inject(SUPABASE_ADMIN_CLIENT) private readonly supabase: SupabaseClient,
  ) {
    const publicKey = config.get("VAPID_PUBLIC_KEY", { infer: true });
    const privateKey = config.get("VAPID_PRIVATE_KEY", { infer: true });
    const subject = config.get("VAPID_SUBJECT", { infer: true });
    if (publicKey && privateKey && subject) {
      webpush.setVapidDetails(subject, publicKey, privateKey);
      this.configured = true;
    } else {
      this.logger.warn(
        "Web Push sin configurar (faltan VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY/VAPID_SUBJECT en el entorno) — sendToUser() no hace nada hasta completarlas en backend/.env",
      );
    }
  }

  /**
   * Manda un push real a todas las suscripciones activas de `userId`.
   * No lanza — cualquier fallo real (suscripción vencida, red, etc.) se
   * loguea o se limpia, nunca tumba a quien llama (mismo criterio que
   * `LocationBroadcastService.notify`).
   */
  async sendToUser(userId: string, category: PushNotificationCategory, payload: PushNotificationPayload): Promise<void> {
    if (!this.configured) return;

    const { data: profile } = await this.supabase
      .from("profiles")
      .select("notification_settings")
      .eq("id", userId)
      .maybeSingle();
    const settings = (profile?.notification_settings ?? null) as Record<string, boolean> | null;
    if (settings && settings[category] === false) {
      return; // La persona apagó este tipo de aviso en Ajustes → Notificaciones — se respeta, no se manda igual.
    }

    const { data: subscriptions, error } = await this.supabase
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("user_id", userId);
    if (error) {
      this.logger.error(`sendToUser(${userId}): no se pudieron leer las suscripciones`, error as Error);
      return;
    }
    if (!subscriptions || subscriptions.length === 0) return;

    const body = JSON.stringify(payload);
    await Promise.all(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint as string, keys: { p256dh: sub.p256dh as string, auth: sub.auth as string } },
            body,
          );
        } catch (err) {
          const statusCode = (err as { statusCode?: number }).statusCode;
          if (statusCode === 404 || statusCode === 410) {
            // El navegador ya no reconoce esta suscripción (desinstaló, borró datos, etc.) — se
            // limpia para no reintentar por siempre contra un endpoint muerto.
            await this.supabase.from("push_subscriptions").delete().eq("id", sub.id as string);
          } else {
            this.logger.error(`sendToUser(${userId}): fallo real al enviar push`, err as Error);
          }
        }
      }),
    );
  }
}
