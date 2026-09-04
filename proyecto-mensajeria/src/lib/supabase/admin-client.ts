/**
 * Cliente de Supabase EXCLUSIVO del panel de administrador (`/admin`, ver
 * `docs/decisions/README.md`). A propósito NO es el mismo objeto que
 * `@/lib/supabase/client` (el de la app normal de mensajería): usa
 * `auth.storageKey` distinto (`sb-copiloto-admin-auth`) para que la sesión
 * de administrador viva en una llave separada de `localStorage`.
 *
 * Por qué importa esto de verdad (no es cosmético): el fundador pidió
 * explícitamente "separar lo del admin totalmente aparte de las pruebas que
 * yo hago como usuario" — si este cliente compartiera la llave por defecto
 * con `@/lib/supabase/client`, iniciar sesión como admin en `/admin` pisaría
 * la sesión de la cuenta de prueba que esté usando en la app normal en ese
 * mismo navegador (y viceversa), porque `supabase-js` guarda una sola sesión
 * por llave de `localStorage`. Con llaves distintas, las dos sesiones viven
 * en paralelo sin interferirse, incluso abiertas en el mismo navegador.
 *
 * La autorización real de qué cuenta SÍ es administrador sigue viviendo
 * 100% en el backend (`AdminGuard`/`ADMIN_USER_ID`, ver
 * `backend/src/common/guards/admin.guard.ts`) — este cliente solo resuelve
 * el login; cualquier cuenta real de Supabase Auth puede iniciar sesión
 * aquí, pero el backend igual la rechaza con 403 si no es la cuenta
 * configurada como `ADMIN_USER_ID`.
 */
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env["VITE_SUPABASE_URL"];
const supabaseKey = import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"];

export const adminSupabase = createClient(supabaseUrl ?? "", supabaseKey ?? "", {
  auth: {
    storageKey: "sb-copiloto-admin-auth",
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});
