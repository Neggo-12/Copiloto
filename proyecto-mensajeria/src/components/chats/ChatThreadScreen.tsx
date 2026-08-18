import { CornerUpLeft, Forward, NavigationArrow, Pencil, Phone, Trash2 } from "@/components/shared/icons";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChatAvatar } from "@/components/chats/GroupAvatar";
import { describeParticipants } from "@/lib/actions/groups";
import { BottomSheet } from "@/components/shared/BottomSheet";
import { DetailScreen } from "@/components/shared/DetailScreen";
import { MessageBubble } from "@/components/chats/MessageBubble";
import { MessageComposer } from "@/components/chats/MessageComposer";
import { RecipientPicker } from "@/components/chats/RecipientPicker";
import { EmojiPickerSheet } from "@/components/chats/EmojiPickerSheet";
import { ReactionBar } from "@/components/chats/ReactionBar";
import { ReactionListSheet } from "@/components/chats/ReactionListSheet";
import {
  canModifyMessage,
  formatLiveRemaining,
  getActiveLiveLocation,
  getUserReaction,
} from "@/lib/actions/chats";
import { CURRENT_USER_ID } from "@/lib/domain/mock-data";
import type { ChatId, Message } from "@/lib/domain/types";
import type { ChatsController } from "@/hooks/useChats";

/** Pantalla 2: conversación individual. */
export function ChatThreadScreen({
  controller,
  chatId,
  onBack,
  onOpenGroupDetail,
  highlightMessageId,
}: {
  controller: ChatsController;
  chatId: ChatId;
  onBack: () => void;
  /** Abre el detalle del grupo al tocar el encabezado (solo grupos). */
  onOpenGroupDetail?: () => void;
  /** Mensaje al que se hace scroll y se resalta brevemente (búsqueda global). */
  highlightMessageId?: string | null;
}) {
  const chat = controller.state.chats.find((item) => item.id === chatId);
  const messages = useMemo(() => controller.getMessages(chatId), [controller, chatId]);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editing, setEditing] = useState<Message | null>(null);
  const [actionsFor, setActionsFor] = useState<Message | null>(null);
  const [forwarding, setForwarding] = useState<Message | null>(null);
  const [reactionsFor, setReactionsFor] = useState<Message | null>(null);
  const [pickerFor, setPickerFor] = useState<Message | null>(null);
  const [highlighted, setHighlighted] = useState<string | null>(highlightMessageId ?? null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);
  /** Tick de 1s para el contador regresivo de la ubicación en vivo. */
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (highlightMessageId) return;
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, highlightMessageId]);

  /** Scroll al mensaje encontrado y resaltado temporal de ~2s. */
  useEffect(() => {
    setHighlighted(highlightMessageId ?? null);
    if (!highlightMessageId) return;
    const raf = requestAnimationFrame(() => {
      highlightRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
    const timer = setTimeout(() => setHighlighted(null), 2200);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
  }, [highlightMessageId]);

  const liveLocation = getActiveLiveLocation(controller.state, chatId, nowMs);

  if (!chat) return null;

  const otherId = chat.participantIds.find((id) => id !== CURRENT_USER_ID) ?? "";
  const other = controller.participants[otherId];
  const isGroup = chat.isGroup;
  const statusLabel = isGroup
    ? describeParticipants(chat, controller.participants)
    : chat.activity === "typing"
      ? "escribiendo…"
      : chat.activity === "recording_audio"
      ? "grabando audio…"
      : other?.isOnline
        ? "en línea"
        : "visto hace poco";

  // En esta fase las llamadas de grupo no aplican: se oculta el botón.
  const callButton = isGroup ? undefined : (
    <button
      type="button"
      aria-label="Llamar"
      onClick={() => controller.startCall(other?.phoneNumber ?? "")}
      className="press touch-target grid place-items-center rounded-full text-primary active:bg-secondary"
    >
      <Phone className="size-5" />
    </button>
  );

  return (
    <DetailScreen
      onBack={onBack}
      {...(callButton ? { trailing: callButton } : {})}
      heading={
        <button
          type="button"
          onClick={onOpenGroupDetail}
          className="flex min-w-0 items-center gap-3 text-left disabled:cursor-default"
        >
          <ChatAvatar chat={chat} participants={controller.participants} size="sm" />
          <div className="min-w-0">
            <p className="truncate text-[16px] font-semibold tracking-tight">{chat.title}</p>
            {/* Ámbar solo para actividad en vivo (escribiendo / grabando). */}
            <p
              className={`truncate text-[12px] ${
                isGroup
                  ? "text-muted-foreground"
                  : chat.activity === "typing" || chat.activity === "recording_audio"
                    ? "font-medium text-accent-warm"
                    : "text-primary"
              }`}
            >
              {statusLabel}
            </p>
          </div>
        </button>
      }
    >
      {/* Banner superior mientras se comparte ubicación en vivo (simulado). */}
      {liveLocation && (
        <div className="flex shrink-0 items-center gap-2.5 border-b border-border/70 bg-accent-warm/15 px-4 py-2.5">
          <NavigationArrow className="size-5 shrink-0 text-accent-warm" weight="fill" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold tracking-tight">
              Compartiendo tu ubicación en vivo
            </p>
            <p className="font-mono text-[12px] text-muted-foreground">
              {formatLiveRemaining(liveLocation, nowMs)} restantes
            </p>
          </div>
          <button
            type="button"
            onClick={() => controller.stopLiveLocation(liveLocation.id)}
            className="press touch-target rounded-full bg-surface px-4 text-[13px] font-semibold text-primary active:bg-secondary"
          >
            Detener
          </button>
        </div>
      )}

      <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto overscroll-contain py-3">
        {messages.map((message, index) =>
          message.kind === "system" ? (
            <p
              key={message.id}
              className="mx-auto my-3 max-w-[85%] text-center text-[13px] leading-snug text-muted-foreground"
            >
              {message.body}
            </p>
          ) : (
          <div
            key={message.id}
            {...(message.id === highlightMessageId ? { ref: highlightRef } : {})}
            className={`rounded-3xl transition-colors duration-500 ${
              highlighted === message.id ? "bg-accent-warm/20" : "bg-transparent"
            }`}
          >
          <MessageBubble
            message={message}
            outgoing={message.senderId === CURRENT_USER_ID}
            /* Agrupación visual de mensajes consecutivos del mismo remitente. */
            firstOfGroup={messages[index - 1]?.senderId !== message.senderId}
            lastOfGroup={messages[index + 1]?.senderId !== message.senderId}
            quoted={
              message.replyToMessageId
                ? messages.find((item) => item.id === message.replyToMessageId) ?? null
                : null
            }
            senderName={
              isGroup
                ? controller.participants[message.senderId]?.displayName ?? "Participante"
                : null
            }
            onReply={() => setReplyTo(message)}
            onLongPress={() => setActionsFor(message)}
            onOpenReactions={() => setReactionsFor(message)}
            showReactionCounts={isGroup}
          />
          </div>
          ),
        )}
        <div ref={bottomRef} />
      </div>

      <MessageComposer
        replyTo={replyTo}
        editing={editing}
        onCancelReply={() => setReplyTo(null)}
        onCancelEdit={() => setEditing(null)}
        onConfirmEdit={(body) => {
          if (editing) controller.editMessage(editing.id, body);
          setEditing(null);
        }}
        handlers={{
          onSendText: (body) => {
            controller.sendTextMessage(chatId, body, replyTo?.id ?? null);
            setReplyTo(null);
          },
          onSendVoiceNote: (duration, waveform) => {
            controller.sendVoiceNote(chatId, duration, waveform, replyTo?.id ?? null);
            setReplyTo(null);
          },
          onSendAttachment: (kind, fileName, size) =>
            controller.sendAttachment(chatId, kind, fileName, size),
          onShareCurrentLocation: () => {
            controller.shareCurrentLocation(chatId, replyTo?.id ?? null);
            setReplyTo(null);
          },
          onStartLiveLocation: (duration) => controller.startLiveLocation(chatId, duration),
        }}
      />

      <BottomSheet
        open={Boolean(actionsFor)}
        title="Mensaje"
        onClose={() => setActionsFor(null)}
      >
        {actionsFor && (
          <ReactionBar
            activeEmoji={getUserReaction(actionsFor)}
            onPick={(emoji) => {
              controller.toggleReaction(actionsFor.id, emoji);
              setActionsFor(null);
            }}
            onOpenPicker={() => {
              setPickerFor(actionsFor);
              setActionsFor(null);
            }}
          />
        )}
        <ul className="p-2">
          <MessageAction
            icon={<CornerUpLeft className="size-5" />}
            label="Responder"
            onClick={() => {
              setReplyTo(actionsFor);
              setActionsFor(null);
            }}
          />
          <MessageAction
            icon={<Forward className="size-5" />}
            label="Reenviar"
            onClick={() => {
              setForwarding(actionsFor);
              setActionsFor(null);
            }}
          />
          {actionsFor && canModifyMessage(actionsFor) && actionsFor.kind === "text" && (
            <MessageAction
              icon={<Pencil className="size-5" />}
              label="Editar (hasta 15 min)"
              onClick={() => {
                setEditing(actionsFor);
                setActionsFor(null);
              }}
            />
          )}
          {actionsFor && canModifyMessage(actionsFor) && (
            <MessageAction
              icon={<Trash2 className="size-5" />}
              label="Eliminar"
              destructive
              onClick={() => {
                controller.deleteMessage(actionsFor.id);
                setActionsFor(null);
              }}
            />
          )}
        </ul>
      </BottomSheet>

      <EmojiPickerSheet
        open={Boolean(pickerFor)}
        activeEmoji={pickerFor ? getUserReaction(pickerFor) : null}
        onPick={(emoji) => {
          if (pickerFor) controller.toggleReaction(pickerFor.id, emoji);
          setPickerFor(null);
        }}
        onClose={() => setPickerFor(null)}
      />

      <ReactionListSheet
        message={
          reactionsFor
            ? controller.state.messages.find((item) => item.id === reactionsFor.id) ?? null
            : null
        }
        participants={controller.participants}
        onRemoveOwnReaction={() => {
          if (reactionsFor) controller.removeReaction(reactionsFor.id);
          setReactionsFor(null);
        }}
        onClose={() => setReactionsFor(null)}
      />

      <RecipientPicker
        open={Boolean(forwarding)}
        title="Reenviar a"
        chats={controller.state.chats.filter((item) => item.id !== chatId)}
        onPickChat={(target) => {
          if (forwarding) controller.forwardMessage(forwarding.id, target.id);
          setForwarding(null);
        }}
        onClose={() => setForwarding(null)}
      />
    </DetailScreen>
  );
}

function MessageAction({
  icon,
  label,
  onClick,
  destructive,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={`press touch-target flex w-full items-center gap-3 rounded-2xl px-4 text-[16px] font-medium active:bg-secondary ${
          destructive ? "text-destructive" : ""
        }`}
      >
        {icon}
        {label}
      </button>
    </li>
  );
}
