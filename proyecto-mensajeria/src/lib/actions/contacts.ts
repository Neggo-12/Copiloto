/**
 * Acciones aisladas y reutilizables de la libreta de contactos.
 * Igual que en `chats.ts` y `notes.ts`, son funciones puras sobre
 * `ContactsState`: las mismas firmas servirán para la UI, para comandos de voz
 * y, más adelante, contra el backend real.
 */
import type { Contact, ContactId, UserId } from "@/lib/domain/types";
import { CURRENT_USER_ID } from "@/lib/domain/mock-data";
import { COUNTRIES, findCountry, normalizeNationalNumber, toE164 } from "@/lib/domain/countries";

export interface ContactsState {
  contacts: Contact[];
}

let sequence = 0;
function nextId(prefix: string): string {
  sequence += 1;
  return `${prefix}_${Date.now().toString(36)}_${sequence}`;
}

/** Orden alfabético estable e insensible a acentos. */
export function sortContacts(contacts: Contact[]): Contact[] {
  return [...contacts].sort((a, b) =>
    a.displayName.localeCompare(b.displayName, "es-CO", { sensitivity: "base" }),
  );
}

/** Buscar por nombre o número (acepta el número con o sin formato). */
export function searchContacts(state: ContactsState, query: string): Contact[] {
  const term = query.trim().toLowerCase();
  const digits = normalizeNationalNumber(query);
  const sorted = sortContacts(state.contacts);
  if (!term) return sorted;
  return sorted.filter(
    (contact) =>
      contact.displayName.toLowerCase().includes(term) ||
      (digits.length > 0 && normalizeNationalNumber(contact.phoneNumber).includes(digits)),
  );
}

/** Contactos que ya usan la app. */
export function getAppContacts(contacts: Contact[]): Contact[] {
  return contacts.filter((contact) => contact.hasAppAccount);
}

/** Contactos del teléfono que todavía no tienen la app. */
export function getInvitableContacts(contacts: Contact[]): Contact[] {
  return contacts.filter((contact) => !contact.hasAppAccount);
}

export function findContact(state: ContactsState, contactId: ContactId): Contact | null {
  return state.contacts.find((contact) => contact.id === contactId) ?? null;
}

/** Número en formato legible para la ficha del contacto. */
export function formatContactPhone(phoneNumber: string): string {
  const country = COUNTRIES.find((item) => phoneNumber.startsWith(item.dialCode));
  if (!country) return phoneNumber;
  const national = phoneNumber.slice(country.dialCode.length);
  // Agrupa de 3 en 3 dejando 4 dígitos al final (ej. +57 300 111 2233).
  const groups: string[] = [];
  let rest = national;
  while (rest.length > 4) {
    groups.push(rest.slice(0, 3));
    rest = rest.slice(3);
  }
  if (rest) groups.push(rest);
  return `${country.dialCode} ${groups.join(" ")}`;
}

export interface AddContactInput {
  nationalNumber: string;
  displayName?: string;
  countryCode?: string;
}

export interface AddContactResult {
  state: ContactsState;
  contact: Contact | null;
  error: string | null;
}

/**
 * Agregar contacto manual por número de celular. El nombre es opcional: si no
 * se indica, se usa el número como nombre visible.
 */
export function addManualContact(state: ContactsState, input: AddContactInput): AddContactResult {
  const country = findCountry(input.countryCode ?? "CO");
  const digits = normalizeNationalNumber(input.nationalNumber);
  if (digits.length !== country.nationalDigits) {
    return {
      state,
      contact: null,
      error: `El número debe tener ${country.nationalDigits} dígitos.`,
    };
  }

  const phoneNumber = toE164(digits, country);
  const existing = state.contacts.find((contact) => contact.phoneNumber === phoneNumber);
  if (existing) {
    return { state, contact: existing, error: "Ese número ya está en tus contactos." };
  }

  const name = (input.displayName ?? "").trim();
  const linkedUserId: UserId = nextId("user");
  const contact: Contact = {
    id: nextId("contact"),
    ownerId: CURRENT_USER_ID,
    displayName: name || formatContactPhone(phoneNumber),
    phoneNumber,
    avatarUrl: null,
    // Simulación: al agregar manualmente asumimos que el número ya usa la app.
    hasAppAccount: true,
    linkedUserId,
    source: "manual",
    isInvited: false,
  };

  return { state: { contacts: [...state.contacts, contact] }, contact, error: null };
}

/** Marca el contacto como invitado y devuelve el enlace de invitación simulado. */
export function inviteContact(
  state: ContactsState,
  contactId: ContactId,
): { state: ContactsState; inviteUrl: string } {
  const inviteUrl = `https://vozz.app/invitar?ref=${CURRENT_USER_ID}`;
  if (typeof window !== "undefined") {
    console.info("[inviteContact] Simulando compartir enlace:", inviteUrl);
  }
  return {
    state: {
      contacts: state.contacts.map((contact) =>
        contact.id === contactId ? { ...contact, isInvited: true } : contact,
      ),
    },
    inviteUrl,
  };
}

export function deleteContact(state: ContactsState, contactId: ContactId): ContactsState {
  return { contacts: state.contacts.filter((contact) => contact.id !== contactId) };
}
