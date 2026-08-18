import { useCallback, useMemo, useState } from "react";
import * as contactActions from "@/lib/actions/contacts";
import type { AddContactInput, ContactsState } from "@/lib/actions/contacts";
import { MOCK_CONTACTS } from "@/lib/domain/mock-data";
import type { Contact, ContactId } from "@/lib/domain/types";

const INITIAL_STATE: ContactsState = { contacts: MOCK_CONTACTS };

export interface ContactsController {
  state: ContactsState;
  /** Todos los contactos, ordenados alfabéticamente. */
  allContacts: Contact[];
  /** Contactos que ya usan la app (fuente única para el selector de Chats). */
  appContacts: Contact[];
  /** Contactos por invitar. */
  invitableContacts: Contact[];
  search: (query: string) => Contact[];
  findContact: (contactId: ContactId) => Contact | null;
  addManualContact: (input: AddContactInput) => { contact: Contact | null; error: string | null };
  inviteContact: (contactId: ContactId) => string;
  deleteContact: (contactId: ContactId) => void;
}

/**
 * Controlador de la pestaña Contactos: única fuente de datos de contactos de
 * la app (Chats y reenvíos la reutilizan, sin mocks duplicados).
 */
export function useContacts(): ContactsController {
  const [state, setState] = useState<ContactsState>(INITIAL_STATE);

  const allContacts = useMemo(() => contactActions.sortContacts(state.contacts), [state]);
  const appContacts = useMemo(() => contactActions.getAppContacts(allContacts), [allContacts]);
  const invitableContacts = useMemo(
    () => contactActions.getInvitableContacts(allContacts),
    [allContacts],
  );

  const search = useCallback(
    (query: string) => contactActions.searchContacts(state, query),
    [state],
  );

  const findContact = useCallback(
    (contactId: ContactId) => contactActions.findContact(state, contactId),
    [state],
  );

  const addManualContact = useCallback(
    (input: AddContactInput) => {
      const result = contactActions.addManualContact(state, input);
      setState(result.state);
      return { contact: result.contact, error: result.error };
    },
    [state],
  );

  const inviteContact = useCallback(
    (contactId: ContactId) => {
      const result = contactActions.inviteContact(state, contactId);
      setState(result.state);
      return result.inviteUrl;
    },
    [state],
  );

  const deleteContact = useCallback((contactId: ContactId) => {
    setState((prev) => contactActions.deleteContact(prev, contactId));
  }, []);

  return {
    state,
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
