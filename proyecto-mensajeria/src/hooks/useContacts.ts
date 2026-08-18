import { useCallback, useEffect, useMemo, useState } from "react";
import * as contactActions from "@/lib/actions/contacts";
import type { AddContactInput, AddContactResult } from "@/lib/actions/contacts";
import { CURRENT_USER_ID } from "@/lib/domain/mock-data";
import type { Contact, ContactId } from "@/lib/domain/types";

export interface ContactsController {
  /** true mientras se cargan los contactos reales por primera vez. */
  isLoading: boolean;
  /** Todos los contactos, ordenados alfabéticamente. */
  allContacts: Contact[];
  /** Contactos que ya usan la app (fuente única para el selector de Chats). */
  appContacts: Contact[];
  /** Contactos por invitar. */
  invitableContacts: Contact[];
  search: (query: string) => Contact[];
  findContact: (contactId: ContactId) => Contact | null;
  addManualContact: (input: AddContactInput) => Promise<AddContactResult>;
  inviteContact: (contactId: ContactId) => Promise<string>;
  deleteContact: (contactId: ContactId) => void;
}

/**
 * Controlador de la pestaña Contactos: única fuente de datos de contactos de
 * la app (Chats y reenvíos la reutilizan, sin mocks duplicados). Conectado a
 * Supabase (tabla `public.contacts`) desde el 2026-08-18 — antes era 100%
 * simulado en memoria.
 */
export function useContacts(): ContactsController {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isLoading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    contactActions.fetchContacts(CURRENT_USER_ID).then((loaded) => {
      if (cancelled) return;
      setContacts(loaded);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const allContacts = useMemo(() => contactActions.sortContacts(contacts), [contacts]);
  const appContacts = useMemo(() => contactActions.getAppContacts(allContacts), [allContacts]);
  const invitableContacts = useMemo(
    () => contactActions.getInvitableContacts(allContacts),
    [allContacts],
  );

  const search = useCallback(
    (query: string) => contactActions.searchContacts({ contacts }, query),
    [contacts],
  );

  const findContact = useCallback(
    (contactId: ContactId) => contactActions.findContact({ contacts }, contactId),
    [contacts],
  );

  const addManualContact = useCallback(async (input: AddContactInput) => {
    const result = await contactActions.addContactByPhone(CURRENT_USER_ID, input);
    if (result.contact) {
      const added = result.contact;
      setContacts((prev) => (prev.some((item) => item.id === added.id) ? prev : [...prev, added]));
    }
    return result;
  }, []);

  const inviteContact = useCallback(async (contactId: ContactId) => {
    const inviteUrl = await contactActions.inviteContactRemote(CURRENT_USER_ID, contactId);
    setContacts((prev) =>
      prev.map((contact) => (contact.id === contactId ? { ...contact, isInvited: true } : contact)),
    );
    return inviteUrl;
  }, []);

  const deleteContact = useCallback((contactId: ContactId) => {
    setContacts((prev) => prev.filter((contact) => contact.id !== contactId));
    void contactActions.deleteContactRemote(contactId);
  }, []);

  return {
    isLoading,
    allContacts,
    appContacts,
    invitableContacts,
    search,
    findContact,
    addManualContact,
    inviteContact,
    deleteContact,
  };
}
