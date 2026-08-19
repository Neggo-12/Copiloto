/**
 * Tipos mínimos del puente de mensajería (backend ↔ Supabase). Reflejan el
 * MISMO esquema que ya usa `proyecto-mensajeria/src/lib/actions/chats.ts` y
 * `contacts.ts` — no se renombran columnas ni se inventa estructura nueva.
 */

export interface ChatSummary {
  chatId: string;
  /** Nombre del grupo, o nombre del otro participante en un chat 1 a 1. */
  title: string;
}

export interface MessageSummary {
  messageId: string;
  senderId: string;
  /** "Tú" cuando el remitente es el mismo usuario que pregunta. */
  senderName: string;
  body: string;
  createdAt: string;
}

export type ChatResolutionError =
  | { error: "not_found" }
  | { error: "ambiguous"; matches: string[] };
