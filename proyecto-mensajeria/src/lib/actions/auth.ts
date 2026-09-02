/**
 * Acciones aisladas y reutilizables del flujo de autenticación.
 *
 * ── Decisión del piloto (2026-09-02, a pedido explícito del fundador) ──
 * El registro real por SMS (`requestPhoneOtp`/`verifyPhoneOtp`, más abajo,
 * contra `supabase.auth.signInWithOtp`/`verifyOtp`) necesita un proveedor de
 * SMS real (Twilio/MessageBird/Vonage) que todavía no está conectado — ver
 * docs/decisions/README.md. Mientras tanto, el piloto ("1 ambulancia + 5-10
 * conductores conocidos") arranca SIN pedir ningún código: solo con el
 * número de celular, mediante `signInByPhoneOnly()` más abajo.
 *
 * Mecanismo real: crea (o inicia sesión en) una cuenta 100% real de
 * Supabase Auth, con email/contraseña sintéticos derivados del número —
 * sigue siendo un usuario y una sesión reales (RLS y todo lo demás
 * funcionan igual). Lo único que cambia es que no se verifica que quien
 * escribió el número sea de verdad el dueño de ese celular.
 *
 * Riesgo de seguridad aceptado a propósito por el fundador (documentado
 * aquí para que quede explícito, no escondido): cualquiera que escriba un
 * número de celular ajeno puede entrar como si fuera esa persona — no hay
 * prueba de posesión del teléfono. Aceptable para un piloto cerrado y
 * pequeño con gente conocida; NO debe usarse así en un lanzamiento público
 * real. Cuando se conecte un proveedor de SMS real, basta con volver a
 * wirear `PhoneStep`/`OtpStep` (`src/components/onboarding/`) a
 * `requestPhoneOtp`/`verifyPhoneOtp` de abajo — ya están completos y
 * probados, solo desconectados de la UI por ahora.
 *
 * La verificación de correo sigue simulada por ahora (secundaria en la spec).
 */
import { supabase } from "@/lib/supabase/client";

const SIMULATED_LATENCY_MS = 900;

export const OTP_LENGTH = 6;
export const OTP_RESEND_SECONDS = 60;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface VerifyOtpResult {
  ok: boolean;
  errorMessage?: string;
  /** Id real del usuario en Supabase Auth (auth.users.id). */
  userId?: string;
}

/**
 * Email/contraseña sintéticos, determinísticos por número de celular.
 *
 * Supabase Auth rechaza dominios "de mentira" como `*.test.internal` con
 * "Email address ... is invalid" (confirmado el 2026-08-18 probando en
 * vivo). Por eso usamos un alias "+" sobre un correo real que el equipo sí
 * controla (Gmail y la mayoría de proveedores entregan
 * `usuario+loquesea@dominio.com` a la misma bandeja de
 * `usuario@dominio.com`, ignorando lo que va después del "+"). Así el
 * dominio es 100% válido para Supabase.
 *
 * OBLIGATORIA para que el registro funcione en cualquier ambiente (local Y
 * Railway) mientras dure el piloto — sin esto, cae al dominio de mentira de
 * abajo y Supabase rechaza a TODOS los usuarios, no solo los de prueba.
 * Configurar en `.env.local` / variable de build de Railway:
 *   VITE_SHADOW_EMAIL_BASE="tu-correo@gmail.com"
 */
function phoneOnlyCredentials(phoneNumber: string): {
  email: string;
  password: string;
} {
  const digitsOnly = phoneNumber.replace(/\D/g, "");
  const base: string | undefined = import.meta.env["VITE_SHADOW_EMAIL_BASE"];
  const [localPart, domain] = base?.includes("@")
    ? base.split("@")
    : [undefined, undefined];

  const email =
    localPart && domain
      ? `${localPart}+u-${digitsOnly}@${domain}`
      : // Fallback si no se configuró VITE_SHADOW_EMAIL_BASE: Supabase también
        // rechazará este dominio (ver nota arriba), pero al menos el mensaje
        // de error dirá con claridad qué falta configurar, en vez de fallar
        // en silencio para todo el mundo.
        `u-${digitsOnly}@copiloto.test.internal`;

  return {
    email,
    password: `phone-only-${digitsOnly}-c0p1l0to`,
  };
}

/**
 * Crea (si no existe) o inicia sesión en la cuenta real de este número de
 * celular, sin pedir ningún código — ver la nota de seguridad arriba del
 * archivo. Intenta `signUp` primero (usuario nuevo): si el proyecto tuviera
 * "Confirm email" activo, `signUp` crearía el usuario pero NO dejaría
 * sesión activa — en ese caso cae a `signInWithPassword`, que fallaría con
 * un mensaje claro ("Email not confirmed") si de verdad siguiera activo
 * (hoy está desactivado, confirmado real contra el proyecto).
 */
export async function signInByPhoneOnly(
  phoneNumber: string,
): Promise<VerifyOtpResult> {
  const { email, password } = phoneOnlyCredentials(phoneNumber);

  const signUp = await supabase.auth.signUp({ email, password });

  if (signUp.data.session?.user) {
    return { ok: true, userId: signUp.data.session.user.id };
  }

  // "User already registered" significa que esta persona ya entró antes con
  // este número (caso normal en visitas repetidas) — no es un error real,
  // hay que caer a `signInWithPassword` como con cualquier otro motivo de
  // "no hubo sesión nueva".
  const alreadyRegistered = Boolean(
    signUp.error?.message.toLowerCase().includes("already registered"),
  );

  // Si `signUp` devolvió un error explícito y distinto (proveedor de email
  // desactivado, política de contraseña, rate limit, etc.), esa es la causa
  // real y NO existe ninguna cuenta creada — mostrar este mensaje en vez del
  // genérico "Invalid login credentials" que devolvería el
  // `signInWithPassword` de abajo (que fallaría igual, pero ocultando el
  // motivo verdadero).
  if (signUp.error && !alreadyRegistered && !signUp.data.user) {
    return {
      ok: false,
      errorMessage: `No se pudo continuar: ${signUp.error.message}`,
    };
  }

  // Llegamos aquí porque el usuario ya existía (visita repetida) y por eso
  // no hubo sesión nueva en el signUp.
  const signIn = await supabase.auth.signInWithPassword({ email, password });
  if (signIn.data.session?.user) {
    return { ok: true, userId: signIn.data.session.user.id };
  }

  return {
    ok: false,
    errorMessage:
      signIn.error?.message ??
      signUp.error?.message ??
      "No se pudo iniciar sesión. Si el error menciona confirmación de correo, " +
        "desactiva 'Confirm email' en Authentication → Providers → Email en el Dashboard de Supabase.",
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Verificación real por SMS — completa y probada, pero DESCONECTADA de la
// UI mientras dure el piloto (ver nota de seguridad arriba del archivo).
// Reconectar cuando haya un proveedor de SMS real: en
// `src/components/onboarding/PhoneStep.tsx` y `OtpStep.tsx`, volver a usar
// estas dos funciones en vez de `signInByPhoneOnly`, y en
// `src/routes/index.tsx` restaurar el paso "otp" entre "phone" y "email".
// ─────────────────────────────────────────────────────────────────────────

export interface RequestPhoneOtpInput {
  phoneNumber: string; // E.164
}
export interface RequestPhoneOtpResult {
  ok: boolean;
  resendAvailableInSeconds: number;
  errorMessage?: string;
}

/** Pide el código por SMS real. */
export async function requestPhoneOtp(
  input: RequestPhoneOtpInput,
): Promise<RequestPhoneOtpResult> {
  if (!input.phoneNumber.startsWith("+")) {
    return {
      ok: false,
      resendAvailableInSeconds: 0,
      errorMessage: "Número inválido.",
    };
  }

  const { error } = await supabase.auth.signInWithOtp({
    phone: input.phoneNumber,
  });
  if (error) {
    return {
      ok: false,
      resendAvailableInSeconds: 0,
      errorMessage: error.message,
    };
  }
  return { ok: true, resendAvailableInSeconds: OTP_RESEND_SECONDS };
}

export interface VerifyOtpInput {
  phoneNumber: string;
  code: string;
}

/** Verifica el OTP contra Supabase Auth. Crea la sesión si el código es correcto. */
export async function verifyPhoneOtp(
  input: VerifyOtpInput,
): Promise<VerifyOtpResult> {
  if (!/^\d{6}$/.test(input.code)) {
    return { ok: false, errorMessage: "El código debe tener 6 dígitos." };
  }

  const { data, error } = await supabase.auth.verifyOtp({
    phone: input.phoneNumber,
    token: input.code,
    type: "sms",
  });
  if (error || !data.user) {
    return {
      ok: false,
      errorMessage: error?.message ?? "No se pudo verificar el código.",
    };
  }
  return { ok: true, userId: data.user.id };
}

export interface RequestEmailVerificationInput {
  email: string;
}

/**
 * Envía (simula) el código/enlace de verificación al correo.
 * Sigue simulado a propósito: la spec marca el correo como identidad
 * secundaria y el flujo real (link magic-link vs. OTP) queda para cuando
 * se aborde ese bloque — ver MISSING_CAPABILITIES.md.
 */
export async function requestEmailVerification(
  input: RequestEmailVerificationInput,
): Promise<{ ok: boolean }> {
  await delay(SIMULATED_LATENCY_MS);
  return { ok: isValidEmail(input.email) };
}

/** Verifica el correo. Simulado: acepta cualquier código de 6 dígitos. */
export async function verifyEmailCode(input: {
  email: string;
  code: string;
}): Promise<VerifyOtpResult> {
  await delay(SIMULATED_LATENCY_MS);
  return /^\d{6}$/.test(input.code)
    ? { ok: true }
    : { ok: false, errorMessage: "El código debe tener 6 dígitos." };
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}
