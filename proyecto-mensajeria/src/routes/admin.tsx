import { createFileRoute } from "@tanstack/react-router";
import { AdminDashboard } from "@/components/admin/AdminDashboard";

/**
 * `/admin` — dashboard de administrador, TOTALMENTE APARTE de la app normal
 * (`/`, ver `routes/index.tsx`): ni comparte el flujo de onboarding por
 * celular, ni la sesión de Supabase (usa `@/lib/supabase/admin-client`, con
 * su propia llave de `localStorage`), ni el shell de 5 pestañas. A pedido
 * explícito del fundador (2026-09-03, ver docs/decisions/README.md decisión
 * (35)): "hazlo como un dashboard aparte, que entre como con correo y con
 * cuenta y listo".
 */
export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [{ title: "Admin — Copiloto" }],
  }),
  component: AdminDashboard,
});
