import { Camera, LogOut, Trash2, UserPlus, Users } from "@/components/shared/icons";
import { useState } from "react";
import { Avatar } from "@/components/shared/Avatar";
import { ConfirmSheet } from "@/components/shared/ConfirmSheet";
import { DetailScreen } from "@/components/shared/DetailScreen";
import { DisappearingMessagesSection } from "@/components/chats/DisappearingMessagesSection";
import { RecipientPicker } from "@/components/chats/RecipientPicker";
import { GROUP_NAME_MAX_LENGTH, canManageGroup, isGroupAdmin } from "@/lib/actions/groups";
import { CURRENT_USER_ID } from "@/lib/domain/mock-data";
import type { ChatId, Contact } from "@/lib/domain/types";
import type { ChatsController } from "@/hooks/useChats";

type PendingAction = "leave" | "delete" | { removeId: string } | null;

/** Detalle del grupo: nombre/foto, participantes y acciones de administración. */
export function GroupDetailScreen({
  controller,
  contacts,
  chatId,
  onBack,
  onExitGroup,
}: {
  controller: ChatsController;
  contacts: Contact[];
  chatId: ChatId;
  onBack: () => void;
  /** Se llama al salir o eliminar el grupo (el chat ya no existe). */
  onExitGroup: () => void;
}) {
  const chat = controller.state.chats.find((item) => item.id === chatId);
  const [pending, setPending] = useState<PendingAction>(null);
  const [isPickerOpen, setPickerOpen] = useState(false);
  const [draftName, setDraftName] = useState<string | null>(null);

  if (!chat || !chat.isGroup) return null;
  const isAdmin = canManageGroup(chat);
  const removingId = typeof pending === "object" && pending ? pending.removeId : null;
  const removingName =
    removingId ? controller.participants[removingId]?.displayName ?? "el participante" : "";

  const availableContacts = contacts.filter(
    (contact) => contact.linkedUserId && !chat.participantIds.includes(contact.linkedUserId),
  );

  return (
    <DetailScreen onBack={onBack} title="Información del grupo">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-8">
        <section className="flex flex-col items-center gap-3 px-6 py-7">
          {isAdmin ? (
            <label className="relative cursor-pointer">
              {chat.avatarUrl ? (
                <Avatar name={chat.title} avatarUrl={chat.avatarUrl} size="lg" className="size-24 text-[24px]" />
              ) : (
                <span className="grid size-24 place-items-center rounded-full border border-border bg-accent text-accent-foreground">
                  <Users className="size-9" />
                </span>
              )}
              <span className="absolute right-0 bottom-0 grid size-8 place-items-center rounded-full bg-primary text-primary-foreground">
                <Camera className="size-4" />
              </span>
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) controller.setGroupAvatar(chat.id, URL.createObjectURL(file));
                }}
              />
            </label>
          ) : chat.avatarUrl ? (
            <Avatar name={chat.title} avatarUrl={chat.avatarUrl} size="lg" className="size-24 text-[24px]" />
          ) : (
            <span className="grid size-24 place-items-center rounded-full border border-border bg-accent text-accent-foreground">
              <Users className="size-9" />
            </span>
          )}

          {isAdmin ? (
            <input
              value={draftName ?? chat.title}
              onChange={(event) => setDraftName(event.target.value.slice(0, GROUP_NAME_MAX_LENGTH))}
              onBlur={() => {
                if (draftName !== null) controller.renameGroup(chat.id, draftName);
                setDraftName(null);
              }}
              aria-label="Nombre del grupo"
              className="touch-target w-full max-w-[18rem] border-b border-border bg-transparent text-center text-[20px] font-semibold tracking-tight outline-none"
            />
          ) : (
            <h2 className="text-[20px] font-semibold tracking-tight">{chat.title}</h2>
          )}
          <p className="font-mono text-[13px] text-muted-foreground">
            {chat.participantIds.length} participantes
          </p>
          {!isAdmin && (
            <p className="text-[13px] text-muted-foreground">
              Solo el administrador puede cambiar el nombre y la foto.
            </p>
          )}
        </section>

        <section className="px-5">
          <h3 className="text-[12px] font-semibold tracking-wide text-muted-foreground uppercase">
            Participantes
          </h3>
          <ul className="mt-2 divide-y divide-border/70">
            {chat.participantIds.map((participantId) => {
              const isMe = participantId === CURRENT_USER_ID;
              const profile = controller.participants[participantId];
              const name = isMe ? "Tú" : profile?.displayName ?? "Participante";
              return (
                <li key={participantId} className="flex items-center gap-3 py-3">
                  <Avatar name={name} avatarUrl={profile?.avatarUrl ?? null} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[16px] font-medium">{name}</span>
                    {profile?.phoneNumber && (
                      <span className="block truncate font-mono text-[13px] text-muted-foreground">
                        {profile.phoneNumber}
                      </span>
                    )}
                  </span>
                  {isGroupAdmin(chat, participantId) && (
                    <span className="rounded-full border border-primary/40 px-2 py-0.5 text-[11px] font-semibold tracking-wide text-primary uppercase">
                      Admin
                    </span>
                  )}
                  {isAdmin && !isMe && (
                    <button
                      type="button"
                      onClick={() => setPending({ removeId: participantId })}
                      className="press touch-target rounded-full px-2 text-[14px] font-medium text-destructive active:bg-secondary"
                    >
                      Quitar
                    </button>
                  )}
                </li>
              );
            })}
          </ul>

          {isAdmin && (
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="press touch-target mt-4 flex w-full items-center gap-3 rounded-2xl border border-border px-4 text-[16px] font-medium text-primary active:bg-secondary"
            >
              <UserPlus className="size-5" /> Agregar participantes
            </button>
          )}
        </section>

        <div className="mt-6">
          <DisappearingMessagesSection
            chat={chat}
            onChange={(ttlSeconds) => controller.setDisappearingMessages(chat.id, ttlSeconds)}
          />
        </div>

        <section className="mt-6 space-y-2 px-5">
          <button
            type="button"
            onClick={() => setPending("leave")}
            className="press touch-target flex w-full items-center gap-3 rounded-2xl border border-border px-4 text-[16px] font-medium text-destructive active:bg-secondary"
          >
            <LogOut className="size-5" /> Salir del grupo
          </button>
          {isAdmin && (
            <button
              type="button"
              onClick={() => setPending("delete")}
              className="press touch-target flex w-full items-center gap-3 rounded-2xl border border-border px-4 text-[16px] font-medium text-destructive active:bg-secondary"
            >
              <Trash2 className="size-5" /> Eliminar grupo
            </button>
          )}
        </section>
      </div>

      <RecipientPicker
        open={isPickerOpen}
        title="Agregar participantes"
        contacts={availableContacts}
        multiSelect
        confirmLabel="Agregar"
        onConfirmSelection={(selected) => {
          const ids = selected
            .map((contact) => contact.linkedUserId)
            .filter((id): id is string => Boolean(id));
          controller.addParticipants(chat.id, ids);
          setPickerOpen(false);
        }}
        onClose={() => setPickerOpen(false)}
      />

      <ConfirmSheet
        open={pending === "leave"}
        title="¿Salir del grupo?"
        description="Dejarás de recibir los mensajes de este grupo."
        confirmLabel="Salir del grupo"
        onConfirm={() => {
          controller.leaveGroup(chat.id);
          setPending(null);
          onExitGroup();
        }}
        onCancel={() => setPending(null)}
      />

      <ConfirmSheet
        open={pending === "delete"}
        title="¿Eliminar el grupo?"
        description="Se elimina el grupo y su historial de mensajes para todos."
        confirmLabel="Eliminar grupo"
        onConfirm={() => {
          controller.deleteGroup(chat.id);
          setPending(null);
          onExitGroup();
        }}
        onCancel={() => setPending(null)}
      />

      <ConfirmSheet
        open={Boolean(removingId)}
        title={`¿Quitar a ${removingName}?`}
        description="Ya no verá los mensajes nuevos del grupo."
        confirmLabel="Quitar del grupo"
        onConfirm={() => {
          if (removingId) controller.removeParticipant(chat.id, removingId);
          setPending(null);
        }}
        onCancel={() => setPending(null)}
      />
    </DetailScreen>
  );
}
