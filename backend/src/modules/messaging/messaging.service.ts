import { Inject, Injectable } from "@nestjs/common";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_ADMIN_CLIENT } from "../../common/supabase/supabase.module";
import type { ChatResolutionError, ChatSummary, MessageSummary } from "./messaging.types";

/** Quita tildes/diacríticos y pasa a minúsculas — para comparar nombres "José" == "jose" == "JOSE". */
const COMBINING_DIACRITICS_PATTERN = new RegExp("[\\u0300-\\u036f]", "g");

function normalizeForMatch(value: string): string {
  return value
    .normalize("NFD")
    .replace(COMBINING_DIACRITICS_PATTERN, "")
    .toLowerCase();
}

/**
 * `candidateName` (nombre guardado en la libreta, sin normalizar) hace
 * match con `normalizedQuery` (ya normalizado por `normalizeForMatch`) si
 * uno contiene al otro completo, O si comparten al menos una palabra
 * completa — cubre tanto "Jose" ⟷ "Jose Luis" en cualquier dirección como
 * apellidos/apodos sueltos. Ver comentario de `resolveChatByContactName`.
 */
function namesLikelyMatch(candidateName: string, normalizedQuery: string): boolean {
  const candidate = normalizeForMatch(candidateName);
  if (candidate.includes(normalizedQuery) || normalizedQuery.includes(candidate)) return true;
  const candidateWords = candidate.split(/\s+/).filter(Boolean);
  const queryWords = normalizedQuery.split(/\s+/).filter(Boolean);
  return candidateWords.some((word) => queryWords.includes(word));
}

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
   * (coincidencia parcial, insensible a mayúsculas/tildes). No inventa un
   * chat nuevo — si nunca han hablado, devuelve `not_found`.
   *
   * Bug real corregido 2026-08-31 (dos partes):
   * 1. El comentario de este método ya decía "insensible a tildes", pero la
   *    implementación usaba `.ilike()` de Postgres, que SOLO ignora
   *    mayúsculas/minúsculas, no tildes — probado real con el fundador
   *    hablando por voz: pedir "José Luis" (con tilde) no encontraba el
   *    contacto guardado como "Jose luis" (sin tilde). Fix: en vez de
   *    filtrar en Postgres (`ilike`), se trae la libreta completa del
   *    usuario (siempre pequeña, sin problema de performance) y se compara
   *    en JS quitando tildes de los dos lados.
   * 2. Además probado real: el contacto guardado en la libreta como solo
   *    "Jose" no hacía match cuando el asistente preguntaba por "José
   *    Luis" (nombre completo que vio en `list_chats`, del perfil real de
   *    esa persona — distinto del nombre corto que el usuario le puso en
   *    SU libreta). Un `includes()` de una sola dirección solo funciona
   *    cuando el query es más corto que el nombre guardado, nunca al
   *    revés. Fix: match por contención en AMBOS sentidos, y además por
   *    palabra suelta en común (así "Jose" ⟷ "Jose Luis" hacen match sin
   *    importar cuál de los dos es más largo).
   */
  async resolveChatByContactName(userId: string, contactNameQuery: string): Promise<{ chatId: string; contactName: string } | ChatResolutionError> {
    const { data: contactRows } = await this.supabase
      .from("contacts")
      .select("display_name, contact_profile_id")
      .eq("user_id", userId)
      .not("contact_profile_id", "is", null);

    const normalizedQuery = normalizeForMatch(contactNameQuery);
    const allContacts = (contactRows ?? []) as { display_name: string; contact_profile_id: string }[];
    const candidates = allContacts.filter((row) => namesLikelyMatch(row.display_name, normalizedQuery));
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
