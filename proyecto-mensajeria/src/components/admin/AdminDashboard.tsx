import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { LogOut, ShieldCheck } from "@/components/shared/icons";
import { adminSupabase } from "@/lib/supabase/admin-client";
import { useEmergencyAdmin } from "@/hooks/useEmergencyAdmin";
import { AdminLoginScreen } from "./AdminLoginScreen";
import { AdminVehiclesPanel } from "./AdminVehiclesPanel";
import { AdminIncidentsPanel } from "./AdminIncidentsPanel";

type SessionState = "checking" | "signed_out" | "signed_in";

/**
 * Dashboard real de `/admin` (2026-09-03, a pedido explícito del fundador:
 * "lo del admin hazlo como un dashboard aparte, que entre como con correo y
 * con cuenta"). Dos capas de acceso reales, cada una honesta sobre lo que
 * está pasando:
 *
 * 1. `SessionState` — ¿hay una sesión de Supabase Auth en el cliente
 *    SEPARADO de admin (`adminSupabase`)? Si no, se muestra
 *    `AdminLoginScreen` (correo + contraseña reales, cuenta propia).
 * 2. `AdminAccess` (dentro de `useEmergencyAdmin`) — con sesión ya activa,
 *    ¿el backend (`AdminGuard`/`ADMIN_USER_ID`) reconoce a ESTA cuenta como
 *    el administrador real? Si no, "Sin acceso" — cualquiera puede crear una
 *    cuenta en el paso 1, pero solo la cuenta configurada del lado del
 *    servidor pasa de aquí (mismo principio ya usado en el resto del
 *    proyecto: nunca confiar en el cliente para decidir permisos).
 */
export function AdminDashboard() {
  const [sessionState, setSessionState] = useState<SessionState>("checking");

  useEffect(() => {
    void adminSupabase.auth.getSession().then(({ data }) => {
      setSessionState(data.session ? "signed_in" : "signed_out");
    });
    const { data: subscription } = adminSupabase.auth.onAuthStateChange((_event, session) => {
      setSessionState(session ? "signed_in" : "signed_out");
    });
    return () => subscription.subscription.unsubscribe();
  }, []);

  if (sessionState === "checking") {
    return (
      <div className="grid min-h-[100dvh] place-items-center bg-background">
        <p className="text-[13px] text-muted-foreground">Cargando...</p>
      </div>
    );
  }

  if (sessionState === "signed_out") {
    return <AdminLoginScreen onSignedIn={() => setSessionState("signed_in")} />;
  }

  return <AdminDashboardContent />;
}

function AdminDashboardContent() {
  const { access, vehicles, incidents, error, assign, setActive, setIncidentStatus } =
    useEmergencyAdmin();

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <header className="safe-top flex items-center justify-between gap-2 border-b border-border/70 bg-surface/80 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-5 text-primary" />
          <p className="text-[15px] font-semibold">Panel de administrador</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void adminSupabase.auth.signOut()}>
          <LogOut className="size-4" />
          Salir
        </Button>
      </header>

      <div className="mx-auto max-w-xl space-y-6 px-4 py-4">
        {access === "checking" && (
          <p className="text-[13px] text-muted-foreground">Verificando acceso...</p>
        )}

        {access === "denied" && (
          <p className="rounded-xl bg-muted px-3 py-2 text-[13px] text-muted-foreground">
            Sin acceso — esta cuenta no es la cuenta de administrador configurada.
            {error && ` (${error})`}
          </p>
        )}

        {access === "granted" && (
          <>
            <AdminIncidentsPanel incidents={incidents} setStatus={setIncidentStatus} />
            <AdminVehiclesPanel vehicles={vehicles} assign={assign} setActive={setActive} />
          </>
        )}
      </div>
    </div>
  );
}
