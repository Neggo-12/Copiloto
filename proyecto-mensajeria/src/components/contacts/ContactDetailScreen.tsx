import { MessageCircle, Phone, Trash2, UserPlus } from "@/components/shared/icons";
import { DetailScreen } from "@/components/shared/DetailScreen";
import { Avatar } from "@/components/shared/Avatar";
import { formatContactPhone } from "@/lib/actions/contacts";
import { startCall } from "@/lib/actions/chats";
import type { ContactsController } from "@/hooks/useContacts";
import type { Contact, ContactId } from "@/lib/domain/types";

/** Pantalla 2: ficha del contacto con acciones de mensaje y llamada. */
export function ContactDetailScreen({
  controller,
  contactId,
  onBack,
  onSendMessage,
}: {
  controller: ContactsController;
  contactId: ContactId;
  onBack: () => void;
  onSendMessage: (contact: Contact) => void;
}) {
  const contact = controller.findContact(contactId);

  if (!contact) {
    return (
      <DetailScreen onBack={onBack} title="Contacto">
        <p className="px-8 py-16 text-center text-[15px] text-muted-foreground">
          Este contacto ya no existe.
        </p>
      </DetailScreen>
    );
  }

  return (
    <DetailScreen onBack={onBack} title="Contacto" className="overflow-y-auto">
      <div className="flex flex-col items-center px-6 pt-8 pb-6">
        <Avatar
          name={contact.displayName}
          avatarUrl={contact.avatarUrl}
          className="size-28 text-[30px]"
        />
        <h2 className="mt-4 text-center text-[24px] font-bold tracking-tight">
          {contact.displayName}
        </h2>
        <p className="mt-1 font-mono text-[15px] text-muted-foreground">
          {formatContactPhone(contact.phoneNumber)}
        </p>
        <p className="mt-1 text-[13px] text-muted-foreground">
          {contact.hasAppAccount
            ? "Ya usa la app"
            : contact.isInvited
              ? "Invitación enviada"
              : "Todavía no usa la app"}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 px-5">
        {contact.hasAppAccount ? (
          <ActionTile
            icon={<MessageCircle className="size-5" />}
            label="Enviar mensaje"
            primary
            onClick={() => onSendMessage(contact)}
          />
        ) : (
          <ActionTile
            icon={<UserPlus className="size-5" />}
            label={contact.isInvited ? "Invitado" : "Invitar"}
            primary
            disabled={contact.isInvited}
            onClick={() => controller.inviteContact(contact.id)}
          />
        )}
        <ActionTile
          icon={<Phone className="size-5" />}
          label="Llamar"
          onClick={() => startCall(contact.phoneNumber)}
        />
      </div>

      <div className="px-5 py-6">
        <button
          type="button"
          onClick={() => {
            controller.deleteContact(contact.id);
            onBack();
          }}
          className="press touch-target flex w-full items-center justify-center gap-2 rounded-2xl border border-border px-5 text-[16px] font-medium text-destructive active:bg-secondary"
        >
          <Trash2 className="size-5" /> Eliminar contacto
        </button>
      </div>
    </DetailScreen>
  );
}

function ActionTile({
  icon,
  label,
  onClick,
  primary,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  primary?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`press flex flex-col items-center gap-2 rounded-2xl border px-4 py-4 text-[15px] font-semibold tracking-tight disabled:opacity-50 ${
        primary
          ? "border-primary/30 bg-primary/12 text-primary"
          : "border-border bg-surface text-foreground"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
