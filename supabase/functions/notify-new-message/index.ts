// Fase 5 (push de mensajería) — cierra el hueco documentado como "fuera de
// alcance" en ADR-0033: proyecto-mensajeria inserta mensajes DIRECTO en
// Supabase (ADR-0018), nunca por el backend NestJS, así que `WebPushService`
// (adapter real de Web Push que ya existe ahí) no tenía dónde engancharse
// para un mensaje nuevo. Esta Edge Function es el otro extremo del trigger
// `public.notify_new_message` (ver migración
// `20260901000000_push_new_message_webhook.sql`) — corre en la infraestructura
// de Supabase, no en el backend del fundador (que hoy vive local, sin URL
// pública a la que Postgres pueda llamar).
//
// verify_jwt = false a propósito: quien llama a esto (el trigger de
// Postgres) no tiene un JWT de usuario real, así que la función implementa
// su PROPIA autenticación (ver punto 2 abajo) — mismo patrón recomendado
// por Supabase para webhooks/llamadas server-to-server.
//
// Seguridad, dos capas:
// 1. El trigger manda solo `message_id` — el resto (chat, remitente,
//    contenido, destinatarios) se vuelve a leer AQUÍ mismo, directo de la
//    base real con el cliente de service role. Nunca se confía en nada que
//    venga en el body de la petición para decidir a quién avisar ni qué
//    mostrar — mismo criterio que `MessagingService.assertParticipant` en el
//    backend (nunca confiar en un id sin verificar contra la base real).
// 2. El header `x-webhook-secret` se compara contra el secreto que vive en
//    Vault (columna encriptada, generado por Postgres solo — ver
//    migración). Sin ese secreto, ni siquiera se molesta en leer nada.
//
// Duplica un poco de lógica de `WebPushService` (backend/src/modules/
// push-notifications/web-push.service.ts) — envío, respeto de
// `notification_settings`, poda de suscripciones vencidas (404/410). Es
// duplicación real, no una decisión tomada a la ligera: esta función corre
// en Deno dentro de Supabase, un runtime distinto al backend NestJS/Node, y
// el backend hoy no tiene URL pública a la que Postgres le pueda pegar — no
// hay forma de reusar la clase real sin antes desplegar el backend en algún
// lado público (decisión de infraestructura aparte, no tomada aquí). Ver
// ADR-0035.
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY");
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY");
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT");

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY && VAPID_SUBJECT) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

interface MessageRow {
  id: string;
  chat_id: string;
  sender_id: string;
  type: string;
  content: string | null;
  deleted_at: string | null;
}

interface ParticipantRow {
  user_id: string;
  is_muted: boolean;
  muted_until: string | null;
}

/** Mismo criterio visual que el resto de "avisos" del proyecto (recordatorios, etc.): un texto corto y honesto, no el mensaje completo si es media. */
function previewFor(type: string, content: string | null): string {
  switch (type) {
    case "text":
      return content && content.length > 0 ? content : "Nuevo mensaje";
    case "voice":
      return "🎤 Nota de voz";
    case "image":
      return content && content.length > 0 ? `📷 ${content}` : "📷 Foto";
    case "document":
      return "📄 Documento";
    case "location":
      return "📍 Ubicación compartida";
    default:
      return "Nuevo mensaje";
  }
}

async function getSharedSecret(): Promise<string | null> {
  const { data, error } = await supabase.rpc("get_edge_webhook_secret");
  if (error) return null;
  return (data as string | null) ?? null;
}

async function sendToRecipient(userId: string, chatId: string, title: string, body: string): Promise<void> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("notification_settings")
    .eq("id", userId)
    .maybeSingle();
  const settings = (profile?.notification_settings ?? null) as Record<string, boolean> | null;
  if (settings && settings["messages"] === false) return; // La persona apagó avisos de mensajes en Ajustes — se respeta, no se manda igual.

  const { data: subscriptions } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId);
  if (!subscriptions || subscriptions.length === 0) return;

  const payload = JSON.stringify({ title, body, data: { url: "/" } });

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint as string, keys: { p256dh: sub.p256dh as string, auth: sub.auth as string } },
          payload,
        );
      } catch (err) {
        const statusCode = (err as { statusCode?: number })?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          // El navegador ya no reconoce esta suscripción — se poda, mismo criterio que WebPushService.sendToUser.
          await supabase.from("push_subscriptions").delete().eq("id", sub.id as string);
        }
      }
    }),
  );
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const expectedSecret = await getSharedSecret();
  const gotSecret = req.headers.get("x-webhook-secret");
  if (!expectedSecret || gotSecret !== expectedSecret) {
    return new Response("Unauthorized", { status: 401 });
  }

  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_SUBJECT) {
    // Mismo criterio que WebPushService: sin llaves VAPID configuradas (secrets
    // de esta función), no-op silencioso — no un 500 que reintente para siempre.
    return new Response("ok (vapid not configured)", { status: 200 });
  }

  let messageId: string | undefined;
  try {
    const body = await req.json();
    messageId = body?.message_id;
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  if (!messageId) return new Response("Bad request", { status: 400 });

  const { data: message } = await supabase
    .from("messages")
    .select("id, chat_id, sender_id, type, content, deleted_at")
    .eq("id", messageId)
    .maybeSingle<MessageRow>();
  if (!message || message.deleted_at || message.type === "system") {
    return new Response("ok (skipped)", { status: 200 });
  }

  const { data: chat } = await supabase
    .from("chats")
    .select("type, name")
    .eq("id", message.chat_id)
    .maybeSingle<{ type: string; name: string | null }>();
  if (!chat) return new Response("ok (chat not found)", { status: 200 });

  const { data: sender } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", message.sender_id)
    .maybeSingle<{ display_name: string }>();
  const senderName = sender?.display_name ?? "Alguien";

  const { data: participants } = await supabase
    .from("chat_participants")
    .select("user_id, is_muted, muted_until")
    .eq("chat_id", message.chat_id)
    .neq("user_id", message.sender_id)
    .returns<ParticipantRow[]>();

  const now = Date.now();
  const recipients = (participants ?? []).filter((p) => {
    if (!p.is_muted) return true;
    if (!p.muted_until) return false; // silenciado sin fecha de fin = indefinido, no avisar
    return new Date(p.muted_until).getTime() <= now; // ya venció el silencio
  });
  if (recipients.length === 0) return new Response("ok (no recipients)", { status: 200 });

  const preview = previewFor(message.type, message.content);
  const title = chat.type === "group" ? (chat.name ?? "Grupo") : senderName;
  const body = chat.type === "group" ? `${senderName}: ${preview}` : preview;

  await Promise.all(recipients.map((recipient) => sendToRecipient(recipient.user_id, message.chat_id, title, body)));

  return new Response("ok", { status: 200 });
});
