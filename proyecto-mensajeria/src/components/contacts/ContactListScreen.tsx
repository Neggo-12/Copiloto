import { Check, Search, Send, UserPlus } from "@/components/shared/icons";
import { useMemo, useState } from "react";
import { Avatar } from "@/components/shared/Avatar";
import { PhoneScreen } from "@/components/shared/PhoneScreen";
import { AddContactSheet } from "@/components/contacts/AddContactSheet";
import { formatContactPhone, getAppContacts, getInvitableContacts } from "@/lib/actions/contacts";
import type { ContactsController } from "@/hooks/useContacts";
import type { Contact, ContactId } from "@/lib/domain/types";
import type { ReactNode } from "react";

/** Pantalla 1: contactos con la app, sección de invitables y alta manual. */
export function ContactListScreen({
  controller,
  onOpenContact,
  tabBar,
}: {
  controller: ContactsController;
  onOpenContact: (contactId: ContactId) => void;
  tabBar: ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [isAddOpen, setAddOpen] = useState(false);

  const results = useMemo(() => controller.search(query), [controller, query]);
  const withApp = useMemo(() => getAppContacts(results), [results]);
  const withoutApp = useMemo(() => getInvitableContacts(results), [results]);

  return (
    <PhoneScreen title="Contactos" showThemeToggle className="justify-between">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="sticky top-0 z-10 space-y-3 bg-background/90 px-4 py-3 backdrop-blur">
          <label className="flex items-center gap-2 rounded-2xl border border-border bg-secondary px-3">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar nombre o número"
              className="touch-target w-full bg-transparent text-[16px] outline-none placeholder:text-muted-foreground"
            />
          </label>
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="press touch-target flex w-full items-center gap-3 rounded-2xl border border-border bg-surface px-4 text-left"
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/12 text-primary">
              <UserPlus className="size-5" />
            </span>
            <span className="text-[16px] font-semibold tracking-tight">Agregar contacto</span>
          </button>
        </div>

        {withApp.length === 0 && withoutApp.length === 0 ? (
          <p className="px-8 py-16 text-center text-[15px] leading-relaxed text-muted-foreground">
            {query
              ? `No encontramos contactos con “${query}”.`
              : "Tu copiloto aún no conoce a nadie. Agrega o invita a tu primer contacto."}
          </p>
        ) : null}

        {withApp.length > 0 && (
          <>
            <SectionTitle>En la app</SectionTitle>
            <ul className="divide-y divide-border/70 border-y border-border/70">
              {withApp.map((contact) => (
                <li key={contact.id}>
                  <button
                    type="button"
                    onClick={() => onOpenContact(contact.id)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-secondary"
                  >
                    <Avatar name={contact.displayName} avatarUrl={contact.avatarUrl} />
                    <ContactIdentity contact={contact} />
                    <Send className="size-4 shrink-0 text-muted-foreground" />
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}

        {withoutApp.length > 0 && (
          <>
            <SectionTitle>Invitar a la app</SectionTitle>
            <ul className="divide-y divide-border/70 border-y border-border/70">
              {withoutApp.map((contact) => (
                <li key={contact.id} className="flex items-center gap-3 px-4 py-3">
                  <Avatar name={contact.displayName} avatarUrl={contact.avatarUrl} />
                  <ContactIdentity contact={contact} />
                  <button
                    type="button"
                    onClick={() => controller.inviteContact(contact.id)}
                    disabled={contact.isInvited}
                    className="press touch-target shrink-0 rounded-full border border-border px-4 text-[14px] font-semibold text-primary disabled:text-muted-foreground disabled:opacity-70"
                  >
                    {contact.isInvited ? (
                      <span className="flex items-center gap-1">
                        <Check className="size-4" /> Invitado
                      </span>
                    ) : (
                      "Invitar"
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}

        <div className="h-8" />
      </div>

      {tabBar}

      <AddContactSheet
        open={isAddOpen}
        controller={controller}
        onClose={() => setAddOpen(false)}
        onAdded={(contactId) => {
          setAddOpen(false);
          onOpenContact(contactId);
        }}
      />
    </PhoneScreen>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="px-5 pt-5 pb-2 text-[12px] font-semibold tracking-wide text-muted-foreground uppercase">
      {children}
    </h2>
  );
}

function ContactIdentity({ contact }: { contact: Contact }) {
  return (
    <span className="min-w-0 flex-1">
      <span className="block truncate text-[16px] font-semibold tracking-tight">
        {contact.displayName}
      </span>
      <span className="mt-0.5 block truncate font-mono text-[13px] text-muted-foreground">
        {formatContactPhone(contact.phoneNumber)}
      </span>
    </span>
  );
}
