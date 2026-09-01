/**
 * Acciones de la libreta de contactos. Las funciones de solo lectura sobre
 * `ContactsState` (ordenar, buscar, filtrar) siguen siendo puras — sirven
 * igual para la UI o para comandos de voz. Agregar/invitar/borrar un
 * contacto ya habla directo con Supabase (tabla `public.contacts`), 2026-08-18.
 */
import type { Contact, ContactId, UserId } from "@/lib/domain/types";
import { COUNTRIES, findCountry, normalizeNationalNumber, toE164 } from "@/lib/domain/countries";
import { supabase } from "@/lib/supabase/client";

export interface ContactsState {
  contacts: Contact[];
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
  contact: Contact | null;
  error: string | null;
}

/** Forma cruda de la fila de `public.contacts` tal como la devuelve Supabase. */
interface ContactRow {
  id: string;
  user_id: string;
  contact_profile_id: string | null;
  display_name: string;
  phone: string;
  avatar_url: string | null;
  source: "device" | "manual";
  is_invited: boolean;
}

const CONTACT_ROW_COLUMNS =
  "id, user_id, contact_profile_id, display_name, phone, avatar_url, source, is_invited";

function mapContactRow(row: ContactRow): Contact {
  return {
    id: row.id,
    ownerId: row.user_id,
    displayName: row.display_name,
    phoneNumber: row.phone,
    avatarUrl: row.avatar_url,
    // Si el contacto quedó vinculado a un perfil real, ya usa la app.
    hasAppAccount: row.contact_profile_id !== null,
    linkedUserId: row.contact_profile_id,
    source: row.source,
    isInvited: row.is_invited,
  };
}

/** Carga la libreta de contactos real del usuario desde Supabase. */
export async function fetchContacts(ownerId: UserId): Promise<Contact[]> {
  const { data, error } = await supabase
    .from("contacts")
    .select(CONTACT_ROW_COLUMNS)
    .eq("user_id", ownerId);
  if (error || !data) return [];
  return (data as ContactRow[]).map(mapContactRow);
}

/**
 * Agrega un contacto real por número de celular. Busca si ese número ya
 * tiene una cuenta (tabla `profiles`): si sí, lo vincula (`contact_profile_id`)
 * para que aparezca disponible en "Nuevo chat"; si no, queda guardado como
 * invitable (mismo comportamiento que antes tenía la versión simulada, solo
 * que ahora la verificación de "¿ya usa la app?" es real).
 */
export async function addContactByPhone(
  ownerId: UserId,
  input: AddContactInput,
): Promise<AddContactResult> {
  const country = findCountry(input.countryCode ?? "CO");
  const digits = normalizeNationalNumber(input.nationalNumber);
  if (digits.length !== country.nationalDigits) {
    return { contact: null, error: `El número debe tener ${country.nationalDigits} dígitos.` };
  }
  const phoneNumber = toE164(digits, country);

  const { data: existingRow } = await supabase
    .from("contacts")
    .select(CONTACT_ROW_COLUMNS)
    .eq("user_id", ownerId)
    .eq("phone", phoneNumber)
    .maybeSingle();
  if (existingRow) {
    return {
      contact: mapContactRow(existingRow as ContactRow),
      error: "Ese número ya está en tus contactos.",
    };
  }

  const { data: matchedProfile } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url")
    .eq("phone", phoneNumber)
    .maybeSingle();

  const name = (input.displayName ?? "").trim();
  const { data: inserted, error } = await supabase
    .from("contacts")
    .insert({
      user_id: ownerId,
      contact_profile_id: matchedProfile?.id ?? null,
      display_name: name || matchedProfile?.display_name || formatContactPhone(phoneNumber),
      phone: phoneNumber,
      avatar_url: matchedProfile?.avatar_url ?? null,
      source: "manual",
      is_invited: false,
    })
    .select(CONTACT_ROW_COLUMNS)
    .single();

  if (error || !inserted) {
    return { contact: null, error: error?.message ?? "No se pudo guardar el contacto." };
  }
  return { contact: mapContactRow(inserted as ContactRow), error: null };
}

/** Marca el contacto como invitado y devuelve el enlace de invitación (simulado: no manda SMS/WhatsApp real todavía). */
export async function inviteContactRemote(ownerId: UserId, contactId: ContactId): Promise<string> {
  const inviteUrl = `https://vozz.app/invitar?ref=${ownerId}`;
  await supabase.from("contacts").update({ is_invited: true }).eq("id", contactId);
  if (typeof window !== "undefined") {
    console.info("[inviteContact] Simulando compartir enlace:", inviteUrl);
  }
  return inviteUrl;
}

export async function deleteContactRemote(contactId: ContactId): Promise<void> {
  await supabase.from("contacts").delete().eq("id", contactId);
}

/**
 * Renombra un contacto ya guardado — el nombre que el DUEÑO de la libreta le
 * puso (`contacts.display_name`), independiente del nombre real de perfil de
 * esa persona. Real gap encontrado 2026-08-31: no existía forma de corregir
 * un nombre mal escrito o distinto al que usa el asistente de voz para
 * buscar contactos (`resolveChatByContactName` busca por este mismo campo).
 */
export async function updateContactDisplayName(
  contactId: ContactId,
  displayName: string,
): Promise<{ error: string | null }> {
  const name = displayName.trim();
  if (!name) return { error: "El nombre no puede quedar vacío." };
  const { error } = await supabase
    .from("contacts")
    .update({ display_name: name })
    .eq("id", contactId);
  return { error: error?.message ?? null };
}
