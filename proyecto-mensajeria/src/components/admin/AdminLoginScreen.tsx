import { useState } from "react";
import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle, Lock, Mail, ShieldCheck } from "@/components/shared/icons";
import { adminSupabase } from "@/lib/supabase/admin-client";

type Mode = "signin" | "signup";

/**
 * Login real y propio del panel de administrador — SEPARADO del onboarding
 * por celular de la app normal (ver `@/lib/supabase/admin-client.ts`: sesión
 * en una llave de `localStorage` distinta, así que iniciar sesión acá no
 * afecta ninguna cuenta de prueba abierta en la app normal en el mismo
 * navegador). Correo + contraseña reales de Supabase Auth — nada simulado.
 *
 * Incluye "Crear cuenta" a propósito: es la única forma de que el fundador
 * cree su propia cuenta de administrador sin tener que decirle su
 * contraseña a nadie (ni siquiera al asistente) — el "Confirm email" del
 * proyecto está desactivado (confirmado real, ver `src/lib/actions/auth.ts`),
 * así que `signUp` deja sesión activa de inmediato, igual que `signInByPhoneOnly`
 * en la app normal. La autorización real de qué cuenta SÍ puede ver el panel
 * sigue siendo 100% del backend (`AdminGuard`/`ADMIN_USER_ID`) — cualquiera
 * puede crear una cuenta aquí, pero solo la cuenta configurada como
 * administrador pasa del "Sin acceso".
 */
export function AdminLoginScreen({ onSignedIn }: { onSignedIn: () => void }) {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting || !email.trim() || !password) return;
    setSubmitting(true);
    setError(null);

    const { data, error: authError } =
      mode === "signin"
        ? await adminSupabase.auth.signInWithPassword({ email: email.trim(), password })
        : await adminSupabase.auth.signUp({ email: email.trim(), password });

    setSubmitting(false);

    if (authError) {
      setError(authError.message);
      return;
    }
    if (!data.session) {
      setError(
        mode === "signup"
          ? "La cuenta se creó pero no quedó sesión activa — intenta iniciar sesión."
          : "No se pudo iniciar sesión.",
      );
      return;
    }
    onSignedIn();
  }

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4 text-foreground">
      <div className="w-full max-w-sm space-y-5 rounded-2xl border border-border bg-card p-6">
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-6 text-primary" />
          <div>
            <p className="text-[17px] font-semibold">Panel de administrador</p>
            <p className="text-[13px] text-muted-foreground">
              Copiloto — acceso exclusivo del fundador
            </p>
          </div>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="admin-email" className="text-[12px]">
              Correo
            </Label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="admin-email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@correo.com"
                className="pl-9"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="admin-password" className="text-[12px]">
              Contraseña
            </Label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="admin-password"
                type="password"
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="pl-9"
              />
            </div>
          </div>

          {error && (
            <p className="flex items-start gap-1.5 text-[13px] text-destructive">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              {error}
            </p>
          )}

          <Button
            type="submit"
            disabled={submitting || !email.trim() || !password}
            className="w-full"
          >
            {submitting ? "Un momento..." : mode === "signin" ? "Iniciar sesión" : "Crear cuenta"}
          </Button>
        </form>

        <button
          type="button"
          onClick={() => {
            setMode((m) => (m === "signin" ? "signup" : "signin"));
            setError(null);
          }}
          className="press w-full text-center text-[13px] text-muted-foreground underline-offset-2 hover:underline"
        >
          {mode === "signin"
            ? "¿Primera vez? Crear cuenta de administrador"
            : "Ya tengo cuenta — iniciar sesión"}
        </button>
      </div>
    </div>
  );
}
