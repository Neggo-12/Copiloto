/**
 * Cliente de Supabase para el front-end.
 *
 * Almacenamiento de sesión — decisión temporal e importante:
 * El fundador estableció como regla de seguridad explícita "nunca localStorage"
 * para datos sensibles (ver CLAUDE.md / PROMPT_MAESTRO_CLAUDE_CODE.md). El plan
 * a largo plazo es usar `@capacitor/preferences` (almacenamiento seguro nativo
 * en iOS/Android) una vez la app se empaquete con Capacitor. PERO: mientras la
 * app corre solo como web/PWA (fase actual de pruebas, sin empaquetar aún),
 * `@capacitor/preferences` internamente cae de vuelta a `localStorage` en el
 * navegador — es decir, adoptarlo hoy NO cumpliría la regla, solo la
 * escondería detrás de otra API.
 *
 * Por eso, mientras dure esta fase de pruebas en navegador, la sesión de
 * Supabase se guarda en memoria (`MemoryStorageAdapter`, abajo): nunca toca
 * disco ni localStorage. Costo aceptado a propósito: la sesión NO sobrevive
 * a un refresh de página (hay que volver a pedir el OTP). Esto se reemplaza
 * por `@capacitor/preferences` en cuanto exista el empaquetado nativo real
 * (Fase de app instalable) — ver docs/decisions/README.md.
 */
import { createClient, type SupportedStorage } from "@supabase/supabase-js";

class MemoryStorageAdapter implements SupportedStorage {
  private store = new Map<string, string>();

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }
}

const supabaseUrl = import.meta.env["VITE_SUPABASE_URL"];
const supabaseKey = import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"];

if (!supabaseUrl || !supabaseKey) {
  console.error(
    "Faltan VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY. Copia .env.example a .env.local y complétalo.",
  );
}

export const supabase = createClient(supabaseUrl ?? "", supabaseKey ?? "", {
  auth: {
    storage: new MemoryStorageAdapter(),
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});
