import { Check, Search, UserPlus } from "@/components/shared/icons";
import { useMemo, useState } from "react";
import { BottomSheet } from "@/components/shared/BottomSheet";
import { Avatar } from "@/components/shared/Avatar";
import { PrimaryAction } from "@/components/shared/PhoneScreen";
import type { Chat, Contact, ContactId } from "@/lib/domain/types";

/**
 * Selector reutilizable de destinatarios (contactos o chats existentes).
 * Se usa para "chat nuevo", "reenviar mensaje" y —en modo `multiSelect`—
 * para elegir participantes de un grupo o agregarlos después.
 */
export function RecipientPicker({
  open,
  title,
  contacts,
  chats,
  onPickContact,
  onPickChat,
  onClose,
  multiSelect = false,
  confirmLabel = "Continuar",
  onConfirmSelection,
}: {
  open: boolean;
  title: string;
  contacts?: Contact[];
  chats?: Chat[];
  onPickContact?: (contact: Contact) => void;
  onPickChat?: (chat: Chat) => void;
  onClose: () => void;
  /** Permite elegir varios contactos (grupos). */
  multiSelect?: boolean;
  confirmLabel?: string;
  onConfirmSelection?: (contacts: Contact[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<ContactId[]>([]);
  const term = query.trim().toLowerCase();

  const filteredContacts = useMemo(
    () =>
      (contacts ?? []).filter(
        (contact) =>
          contact.displayName.toLowerCase().includes(term) ||
          contact.phoneNumber.includes(term),
      ),
    [contacts, term],
  );

  const filteredChats = useMemo(
    () => (chats ?? []).filter((chat) => chat.title.toLowerCase().includes(term)),
    [chats, term],
  );

  const selected = useMemo(
    () => (contacts ?? []).filter((contact) => selectedIds.includes(contact.id)),
    [contacts, selectedIds],
  );

  const toggle = (contact: Contact) => {
    setSelectedIds((prev) =>
      prev.includes(contact.id)
        ? prev.filter((id) => id !== contact.id)
        : [...prev, contact.id],
    );
  };

  const close = () => {
    setSelectedIds([]);
    setQuery("");
    onClose();
  };

  return (
    <BottomSheet
      open={open}
      title={title}
      onClose={close}
      {...(multiSelect
        ? {
            footer: (
              <PrimaryAction
                disabled={selected.length === 0}
                onClick={() => {
                  onConfirmSelection?.(selected);
                  setSelectedIds([]);
                  setQuery("");
                }}
              >
                {confirmLabel}
                {selected.length > 0 ? ` (${selected.length})` : ""}
              </PrimaryAction>
            ),
          }
        : {})}
    >
      <div className="px-4 pt-3 pb-2">
        <label className="flex items-center gap-2 rounded-2xl border border-border bg-secondary px-3">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar nombre o número"
            className="touch-target w-full bg-transparent text-[16px] outline-none placeholder:text-muted-foreground"
          />
        </label>
      </div>

      <ul className="pb-2">
        {!multiSelect && filteredChats.length > 0 && (
          <li className="px-5 pt-2 pb-1 text-[12px] font-semibold tracking-wide text-muted-foreground uppercase">
            Chats
          </li>
        )}
        {!multiSelect &&
          filteredChats.map((chat) => (
            <li key={chat.id}>
              <button
                type="button"
                onClick={() => onPickChat?.(chat)}
                className="press flex w-full items-center gap-3 px-5 py-3 text-left active:bg-secondary"
              >
                <Avatar name={chat.title} avatarUrl={chat.avatarUrl} size="sm" />
                <span className="min-w-0 flex-1 truncate text-[16px] font-medium">
                  {chat.title}
                </span>
              </button>
            </li>
          ))}

        {filteredContacts.length > 0 && (
          <li className="px-5 pt-3 pb-1 text-[12px] font-semibold tracking-wide text-muted-foreground uppercase">
            Contactos
          </li>
        )}
        {filteredContacts.map((contact) => {
          const isSelected = selectedIds.includes(contact.id);
          return (
            <li key={contact.id}>
              <button
                type="button"
                onClick={() => (multiSelect ? toggle(contact) : onPickContact?.(contact))}
                disabled={!contact.hasAppAccount}
                aria-pressed={multiSelect ? isSelected : undefined}
                className="press flex w-full items-center gap-3 px-5 py-3 text-left active:bg-secondary disabled:opacity-45"
              >
                <Avatar name={contact.displayName} avatarUrl={contact.avatarUrl} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[16px] font-medium">
                    {contact.displayName}
                  </span>
                  <span className="block truncate font-mono text-[13px] text-muted-foreground">
                    {contact.phoneNumber}
                  </span>
                </span>
                {multiSelect ? (
                  <span
                    className={`grid size-6 shrink-0 place-items-center rounded-full border ${
                      isSelected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border"
                    }`}
                  >
                    {isSelected && <Check className="size-4" />}
                  </span>
                ) : (
                  !contact.hasAppAccount && (
                    <span className="flex items-center gap-1 text-[12px] text-muted-foreground">
                      <UserPlus className="size-3.5" /> Invitar
                    </span>
                  )
                )}
              </button>
            </li>
          );
        })}

        {filteredContacts.length === 0 && filteredChats.length === 0 && (
          <li className="px-5 py-10 text-center text-[15px] text-muted-foreground">
            Sin resultados para “{query}”.
          </li>
        )}
      </ul>
    </BottomSheet>
  );
}
