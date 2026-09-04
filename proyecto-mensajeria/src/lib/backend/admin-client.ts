/**
 * Cliente de backend EXCLUSIVO del panel de administrador — mismas llamadas
 * reales (`/emergency/admin/...`) que `@/lib/backend/client`, pero
 * autenticado con la sesión separada de `@/lib/supabase/admin-client` (no la
 * sesión de la app normal). Reusa la fábrica `createBackendClient()` en vez
 * de duplicar la lógica de fetch/errores.
 */
import { createBackendClient } from "@/lib/backend/client";
import { adminSupabase } from "@/lib/supabase/admin-client";

export const adminBackend = createBackendClient(adminSupabase);
