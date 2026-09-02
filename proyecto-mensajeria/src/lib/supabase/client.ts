/**
 * Cliente de Supabase para el front-end.
 *
 * Almacenamiento de sesión — historial de la decisión:
 * El fundador había establecido como regla de seguridad "nunca localStorage"
 * (ver CLAUDE.md / PROMPT_MAESTRO_CLAUDE_CODE.md), así que hasta 2026-09-02
 * la sesión se guardaba en memoria (`MemoryStorageAdapter`, un `Map`): nunca
 * tocaba disco. Costo aceptado en ese momento: la sesión NO sobrevivía a un
 * refresh de página (había que volver a pedir el OTP cada vez).
 *
 * En el uso real del piloto esto resultó ser un problema (cada refresh
 * forzaba re-registro, y no tenía sentido pedirle el código otra vez a
 * alguien que ya se había verificado). El fundador confirmó explícitamente
 * (2026-09-02) cambiar a almacenamiento persistente para este caso puntual.
 *
 * Por eso ahora NO se pasa `storage` explícito: al quedar `persistSession:
 * true` sin `storage`, el propio SDK de Supabase (`@supabase/auth-js`,
 * `GoTrueClient`) usa automáticamente `globalThis.localStorage` cuando está
 * disponible (verificado leyendo el código real instalado en
 * `node_modules/@supabase/auth-js/dist/main/GoTrueClient.js`) — es el mismo
 * comportamiento estándar de cualquier app web con Supabase, sin lógica
 * propia que mantener. La sesión ahora sí sobrevive a un refresh.
 *
 * Nota de seguridad real (no cosmética): esto NO abre la puerta a que
 * "cualquiera con el número entre" — el OTP verificado por SMS solo se pide
 * una vez por dispositivo/navegador; guardar la sesión ya autenticada en ese
 * mismo navegador es el comportamiento normal de cualquier app (WhatsApp Web,
 * Gmail, bancos). Si más adelante se quiere alertar sobre inicios de sesión
 * desde un dispositivo/IP nuevo (patrón "nuevo dispositivo" tipo Gmail), eso
 * es una función aparte por construir — no cambia esta decisión de
 * almacenamiento. Cuando la app se empaquete con Capacitor (Fase de app
 * instalable), se puede migrar a `@capacitor/preferences` (almacenamiento
 * nativo) — ver docs/decisions/README.md.
 */
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env["VITE_SUPABASE_URL"];
const supabaseKey = import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"];

if (!supabaseUrl || !supabaseKey) {
  console.error(
    "Faltan VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY. Copia .env.example a .env.local y complétalo.",
  );
}

export const supabase = createClient(supabaseUrl ?? "", supabaseKey ?? "", {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});
