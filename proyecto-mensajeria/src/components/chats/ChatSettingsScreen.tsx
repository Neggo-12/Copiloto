import { Avatar } from "@/components/shared/Avatar";
import { DetailScreen } from "@/components/shared/DetailScreen";
import { DisappearingMessagesSection } from "@/components/chats/DisappearingMessagesSection";
import { CURRENT_USER_ID } from "@/lib/domain/mock-data";
import type { ChatId } from "@/lib/domain/types";
import type { ChatsController } from "@/hooks/useChats";

/** Detalle del chat individual: perfil del contacto y ajustes del hilo. */
export function ChatSettingsScreen({
  controller,
  chatId,
  onBack,
}: {
  controller: ChatsController;
  chatId: ChatId;
  onBack: () => void;
}) {
  const chat = controller.state.chats.find((item) => item.id === chatId);
  if (!chat || chat.isGroup) return null;

  const otherId = chat.participantIds.find((id) => id !== CURRENT_USER_ID) ?? "";
  const other = controller.participants[otherId];

  return (
    <DetailScreen onBack={onBack} title="Información del chat">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-8">
        <section className="flex flex-col items-center gap-2 px-6 py-7">
          <Avatar
            name={chat.title}
            avatarUrl={other?.avatarUrl ?? null}
            size="lg"
            className="size-24 text-[24px]"
          />
          <h2 className="text-[20px] font-semibold tracking-tight">{chat.title}</h2>
          {other?.phoneNumber && (
            <p className="font-mono text-[13px] text-muted-foreground">{other.phoneNumber}</p>
          )}
        </section>

        <DisappearingMessagesSection
          chat={chat}
          onChange={(ttlSeconds) => controller.setDisappearingMessages(chat.id, ttlSeconds)}
        />
      </div>
    </DetailScreen>
  );
}
