import { Inject, Injectable } from "@nestjs/common";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_ADMIN_CLIENT } from "../../common/supabase/supabase.module";
import type { ChatResolutionError, ChatSummary, MessageSummary } from "./messaging.types";

/**
 * Envoltorio real sobre las MISMAS tablas de Supabase que ya usa
 * proyecto-mensajeria (`chats`, `chat_participants`, `messages`, `contacts`,
 * `profiles` — mismas columnas, ver proyecto-mensajeria/src/lib/actions/
 * chats.ts y contacts.ts). Este servicio usa el cliente admin
 * (SUPABASE_ADMIN_CLIENT bypassa RLS a propósito, ver SupabaseModule), así
 * que CADA método reimplementa a mano la misma autorización que la RLS real
 * exige allá — nunca se confía en un chatId que venga de un argumento de
 * tool sin verificar pertenencia primero.
 *
 * Alcance a propósito, hoy: SOLO chats 1 a 1 y mensajes de tipo texto. Según
 * el comentario de origen en chats.ts, reacciones, notas de voz, fotos,
 * documentos, ubicación y grupos siguen siendo simulación local en el
 * frontend — todavía no existen como datos reales en Supabase, así que este
 * backend tampoco puede leerlos/mandarlos de verdad. Ver ADR del puente de
 * mensajería.
 */
@Injectable()
export class MessagingService {
  constructor(@Inject(SUPABASE_ADMIN_CLIENT) private readonly supabase: SupabaseClient) {}

  /** Confirma que `userId` es participante real de `chatId` — reemplaza la RLS bypaseada. */
  private async assertParticipant(userId: string, chatId: string): Promise<boolean> {
    const { data } = await this.supabase
      .from("chat_participants")
      .select("user_id")
      .eq("chat_id", chatId)
      .eq("user_id", userId)
      .maybeSingle();
    return data !== null;
  }

  async listChats(userId: string): Promise<ChatSummary[]> {
    const { data: myRows } = await this.supabase.from("chat_participants").select("chat_id").eq("user_id", userId);
    const chatIds = (myRows ?? []).map((row) => row.chat_id as string);
    if (chatIds.length === 0) return [];

    const [{ data: chatRows }, { data: participantRows }] = await Promise.all([
      this.supabase.from("chats").select("id, type, name").in("id", chatIds),
      this.supabase.from("chat_participants").select("chat_id, user_id").in("chat_id", chatIds),
    ]);

    const otherIdByChat = new Map<string, string>();
    for (const row of (participantRows ?? []) as { chat_id: string; user_id: string }[]) {
      if (row.user_id !== userId) otherIdByChat.set(row.chat_id, row.user_id);
    }
    const otherIds = Array.from(new Set(otherIdByChat.values()));
    const { data: profileRows } =
      otherIds.length > 0
        ? await this.supabase.from("profiles").select("id, display_name").in("id", otherIds)
        : { data: [] as { id: string; display_name: string }[] };
    const nameById = new Map((profileRows ?? []).map((row) => [row.id as string, row.display_name as string]));

    return ((chatRows ?? []) as { id: string; type: "individual" | "group"; name: string | null }[]).map((row) => ({
      chatId: row.id,
      title: row.type === "group" ? (row.name ?? "Grupo") : (nameById.get(otherIdByChat.get(row.id) ?? "") ?? "Usuario"),
    }));
  }

  /**
   * Busca, entre los contactos reales del usuario, un chat 1 a 1 por nombre
   * (coincidencia parcial, insensible a mayúsculas/tildes básicas). No
   * inventa un chat nuevo — si nunca han hablado, devuelve `not_found`.
   */
  async resolveChatByContactName(userId: string, contactNameQuery: string): Promise<{ chatId: string; contactName: string } | ChatResolutionError> {
    const { data: contactRows } = await this.supabase
      .from("contacts")
      .select("display_name, contact_profile_id")
      .eq("user_id", userId)
      .not("contact_profile_id", "is", null)
      .ilike("display_name", `%${contactNameQuery}%`);

    const candidates = (contactRows ?? []) as { display_name: string; contact_profile_id: string }[];
    if (candidates.length === 0) return { error: "not_found" };
    if (candidates.length > 1) return { error: "ambiguous", matches: candidates.map((row) => row.display_name) };

    const other = candidates[0];

    const { data: myParticipantRows } = await this.supabase.from("chat_participants").select("chat_id").eq("user_id", userId);
    const myChatIds = (myParticipantRows ?? []).map((row) => row.chat_id as string);
    if (myChatIds.length === 0) return { error: "not_found" };

    const { data: sharedRows } = await this.supabase
      .from("chat_participants")
      .select("chat_id")
      .eq("user_id", other.contact_profile_id)
      .in("chat_id", myChatIds);

    const chatId = ((sharedRows ?? [])[0] as { chat_id: string } | undefined)?.chat_id;
    if (!chatId) return { error: "not_found" };
    return { chatId, contactName: other.display_name };
  }

  /** null = el usuario no pertenece a ese chat (autorización denegada), no "no hay mensajes". */
  async getRecentTextMessages(userId: string, chatId: string, limit = 10): Promise<MessageSummary[] | null> {
    const allowed = await this.assertParticipant(userId, chatId);
    if (!allowed) return null;

    const { data: rows } = await this.supabase
      .from("messages")
      .select("id, sender_id, content, created_at")
      .eq("chat_id", chatId)
      .eq("type", "text")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(limit);

    const messages = (rows ?? []) as { id: string; sender_id: string; content: string | null; created_at: string }[];
    const senderIds = Array.from(new Set(messages.map((row) => row.sender_id)));
    const { data: profileRows } =
      senderIds.length > 0
        ? await this.supabase.from("profiles").select("id, display_name").in("id", senderIds)
        : { data: [] as { id: string; display_name: string }[] };
    const nameById = new Map((profileRows ?? []).map((row) => [row.id as string, row.display_name as string]));

    return messages
      .map((row) => ({
        messageId: row.id,
        senderId: row.sender_id,
        senderName: row.sender_id === userId ? "Tú" : (nameById.get(row.sender_id) ?? "Usuario"),
        body: row.content ?? "",
        createdAt: row.created_at,
      }))
      .reverse();
  }

  /** null = el usuario no pertenece a ese chat (autorización denegada). */
  async sendTextMessage(userId: string, chatId: string, body: string): Promise<MessageSummary | null> {
    const allowed = await this.assertParticipant(userId, chatId);
    if (!allowed) return null;

    const { data, error } = await this.supabase
      .from("messages")
      .insert({ chat_id: chatId, sender_id: userId, type: "text", content: body })
      .select("id, created_at")
      .single();
    if (error || !data) return null;

    return { messageId: data.id as string, senderId: userId, senderName: "Tú", body, createdAt: data.created_at as string };
  }
}
