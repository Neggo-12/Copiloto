import { useState } from "react";
import type { ReactNode } from "react";
import { ContactListScreen } from "@/components/contacts/ContactListScreen";
import { ContactDetailScreen } from "@/components/contacts/ContactDetailScreen";
import type { ContactsController } from "@/hooks/useContacts";
import type { Contact, ContactId } from "@/lib/domain/types";

/** Pestaña Contactos: alterna entre la lista y el detalle del contacto. */
export function ContactsTab({
  controller,
  tabBar,
  onSendMessage,
}: {
  controller: ContactsController;
  tabBar: ReactNode;
  onSendMessage: (contact: Contact) => void;
}) {
  const [openContactId, setOpenContactId] = useState<ContactId | null>(null);

  if (openContactId) {
    return (
      <ContactDetailScreen
        controller={controller}
        contactId={openContactId}
        onBack={() => setOpenContactId(null)}
        onSendMessage={onSendMessage}
      />
    );
  }

  return (
    <ContactListScreen
      controller={controller}
      tabBar={tabBar}
      onOpenContact={setOpenContactId}
    />
  );
}
