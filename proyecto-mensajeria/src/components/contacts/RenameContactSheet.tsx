import { useEffect, useState } from "react";
import { BottomSheet } from "@/components/shared/BottomSheet";
import { PrimaryAction } from "@/components/shared/PhoneScreen";
import type { ContactsController } from "@/hooks/useContacts";
import type { Contact } from "@/lib/domain/types";

/**
 * Edita el nombre que TÚ le pusiste a un contacto en tu libreta
 * (`contacts.display_name`) — puede ser distinto al nombre real de perfil de
 * esa persona. Mismo hueco real reportado 2026-08-31: el asistente de voz
 * busca por este nombre (`resolveChatByContactName`), así que si aquí dice
 * "josefin" pero la persona se llama "José Luis" en los chats, la voz no la
 * encuentra hasta corregir el nombre aquí.
 */
export function RenameContactSheet({
  open,
  controller,
  contact,
  onClose,
}: {
  open: boolean;
  controller: ContactsController;
  contact: Contact;
  onClose: () => void;
}) {
  const [displayName, setDisplayName] = useState(contact.displayName);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setSaving] = useState(false);

  // Cada vez que se abre (o cambia el contacto seleccionado) arranca del
  // nombre actual, no del valor que haya quedado de una edición anterior.
  useEffect(() => {
    if (open) {
      setDisplayName(contact.displayName);
      setError(null);
    }
  }, [open, contact.displayName]);

  async function handleSubmit() {
    setSaving(true);
    const result = await controller.renameContact(contact.id, displayName);
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    onClose();
  }

  return (
    <BottomSheet
      open={open}
      title="Editar nombre"
      onClose={onClose}
      footer={
        <PrimaryAction
          onClick={() => {
            void handleSubmit();
          }}
          disabled={displayName.trim().length === 0 || isSaving}
          loading={isSaving}
        >
          Guardar
        </PrimaryAction>
      }
    >
      <div className="space-y-4 px-5 py-4">
        <div>
          <label
            htmlFor="rename-contact-name"
            className="block pb-1.5 text-[13px] font-medium text-muted-foreground"
          >
            Nombre
          </label>
          <input
            id="rename-contact-name"
            value={displayName}
            onChange={(event) => {
              setDisplayName(event.target.value);
              setError(null);
            }}
            placeholder="Ej. José Luis"
            className="touch-target w-full rounded-2xl border border-border bg-secondary px-3 text-[16px] outline-none placeholder:text-muted-foreground"
          />
        </div>
        {error && <p className="text-[14px] text-destructive">{error}</p>}
      </div>
    </BottomSheet>
  );
}
