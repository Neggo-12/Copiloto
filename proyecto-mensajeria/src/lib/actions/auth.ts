/**
 * Acciones aisladas y reutilizables del flujo de autenticación.
 * Fase 2: verificación telefónica contra Supabase Auth real, con un atajo de
 * prueba (`DEV_TEST_PHONES`, ver más abajo) para probar sin depender de un
 * proveedor de SMS pago mientras eso se decide.
 * La verificación de correo sigue simulada por ahora (secundaria en la spec).
 */
import { supabase } from "@/lib/supabase/client";

const SIMULATED_LATENCY_MS = 900;

export const OTP_LENGTH = 6;
export const OTP_RESEND_SECONDS = 60;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * ── Atajo de números de prueba (TEMPORAL — quitar antes de producción) ──
 *
 * Supabase Auth necesita un proveedor de SMS real (Twilio/MessageBird/Vonage)
 * para enviar códigos de verdad. Su función "Test OTP" (números fijos sin
 * enviar SMS) solo existe para instalaciones self-hosted, NO para proyectos
 * en la nube como el nuestro — lo confirmamos el 2026-08-18 tras varios
 * intentos fallidos de encontrarla en el Dashboard.
 *
 * Mientras se decide/paga un proveedor real, esta lista deja pasar un puñado
 * de números fijos (los del fundador y las personas con las que va a probar
 * la mensajería) sin enviar SMS. Para esos números, en vez de hablar con el
 * flujo de teléfono de Supabase, creamos/iniciamos sesión en una cuenta
 * "sombra" con email+password sintéticos — sigue siendo un usuario y una
 * sesión 100% reales de Supabase Auth (RLS y todo lo demás funcionan igual),
 * solo que la verificación del código no pasa por ningún SMS.
 *
 * Formato en `.env.local` (nunca se commitea):
 *   VITE_DEV_TEST_PHONES="+573024330410:123456,+573001112233:654321"
 *
 * Riesgo aceptado y documentado (ver TECHNICAL_DEBT.md): las variables
 * VITE_* quedan visibles en el bundle de JS si esta build se publica en una
 * URL pública. Aceptable mientras el proyecto solo se prueba localmente
 * entre el fundador y un puñado de personas de confianza — HAY QUE quitar
 * esta lista (o esconderla detrás de una función server-side) antes de
 * cualquier despliegue público real.
 */
interface DevTestPhone {
  phoneNumber: string;
  code: string;
}

function parseDevTestPhones(): DevTestPhone[] {
  const raw: string | undefined = import.meta.env["VITE_DEV_TEST_PHONES"];
  if (!raw) return [];
  return raw
    .split(",")
    .map((entry: string) => entry.trim())
    .filter(Boolean)
    .flatMap((entry: string) => {
      const [phoneNumber, code] = entry.split(":").map((part: string) => part.trim());
      return phoneNumber && code ? [{ phoneNumber, code }] : [];
    });
}

const DEV_TEST_PHONES = parseDevTestPhones();

function findDevTestPhone(phoneNumber: string): DevTestPhone | undefined {
  return DEV_TEST_PHONES.find((entry) => entry.phoneNumber === phoneNumber);
}

/** Email/contraseña sintéticos, determinísticos por número, para la cuenta sombra. */
function devShadowCredentials(phoneNumber: string): { email: string; password: string } {
  const digitsOnly = phoneNumber.replace(/\D/g, "");
  return {
    email: `dev-${digitsOnly}@copiloto.test.internal`,
    password: `dev-test-phone-${digitsOnly}-c0p1l0to`,
  };
}

/**
 * Inicia sesión en la cuenta sombra del número de prueba, creándola si no
 * existe. Intenta `signUp` primero (usuario nuevo): si el proyecto tiene
 * "Confirm email" activo, `signUp` crea el usuario pero NO deja sesión
 * activa — en ese caso caemos a `signInWithPassword`, que fallará con un
 * mensaje claro ("Email not confirmed") si de verdad sigue activo. Ver la
 * nota de DEV_TEST_PHONES arriba para cómo desactivarlo.
 */
async function signInDevShadowUser(phoneNumber: string): Promise<VerifyOtpResult> {
  const { email, password } = devShadowCredentials(phoneNumber);

  const signUp = await supabase.auth.signUp({ email, password });

  if (signUp.data.session?.user) {
    return { ok: true, userId: signUp.data.session.user.id };
  }

  // Si `signUp` devolvió un error explícito (proveedor de email desactivado,
  // política de contraseña, rate limit, etc.), esa es la causa real y NO
  // existe ninguna cuenta creada — mostrar este mensaje en vez del genérico
  // "Invalid login credentials" que devolvería el `signInWithPassword` de
  // abajo (que fallaría igual, pero ocultando el motivo verdadero).
  if (signUp.error && !signUp.data.user) {
    return {
      ok: false,
      errorMessage: `No se pudo crear la cuenta de prueba: ${signUp.error.message}`,
    };
  }

  // Llegamos aquí solo si el usuario ya existía (caso normal en visitas
  // repetidas) y por eso no hubo sesión nueva en el signUp.
  const signIn = await supabase.auth.signInWithPassword({ email, password });
  if (signIn.data.session?.user) {
    return { ok: true, userId: signIn.data.session.user.id };
  }

  return {
    ok: false,
    errorMessage:
      signIn.error?.message ??
      signUp.error?.message ??
      "No se pudo iniciar la cuenta de prueba. Si el error menciona confirmación de correo, " +
        "desactiva 'Confirm email' en Authentication → Providers → Email en el Dashboard de Supabase.",
  };
}

export interface RequestPhoneOtpInput {
  phoneNumber: string; // E.164
}
export interface RequestPhoneOtpResult {
  ok: boolean;
  resendAvailableInSeconds: number;
  errorMessage?: string;
}

/** Pide el código por SMS (o, para números de prueba, simula el envío sin SMS real). */
export async function requestPhoneOtp(input: RequestPhoneOtpInput): Promise<RequestPhoneOtpResult> {
  if (!input.phoneNumber.startsWith("+")) {
    return { ok: false, resendAvailableInSeconds: 0, errorMessage: "Número inválido." };
  }

  if (findDevTestPhone(input.phoneNumber)) {
    await delay(400);
    return { ok: true, resendAvailableInSeconds: OTP_RESEND_SECONDS };
  }

  const { error } = await supabase.auth.signInWithOtp({
    phone: input.phoneNumber,
  });
  if (error) {
    return { ok: false, resendAvailableInSeconds: 0, errorMessage: error.message };
  }
  return { ok: true, resendAvailableInSeconds: OTP_RESEND_SECONDS };
}

export interface VerifyOtpInput {
  phoneNumber: string;
  code: string;
}
export interface VerifyOtpResult {
  ok: boolean;
  errorMessage?: string;
  /** Id real del usuario en Supabase Auth (auth.users.id) tras verificar. */
  userId?: string;
}

/** Verifica el OTP contra Supabase Auth. Crea la sesión si el código es correcto. */
export async function verifyPhoneOtp(input: VerifyOtpInput): Promise<VerifyOtpResult> {
  if (!/^\d{6}$/.test(input.code)) {
    return { ok: false, errorMessage: "El código debe tener 6 dígitos." };
  }

  const devPhone = findDevTestPhone(input.phoneNumber);
  if (devPhone) {
    if (input.code !== devPhone.code) {
      return { ok: false, errorMessage: "Código incorrecto (número de prueba)." };
    }
    return signInDevShadowUser(input.phoneNumber);
  }

  const { data, error } = await supabase.auth.verifyOtp({
    phone: input.phoneNumber,
    token: input.code,
    type: "sms",
  });
  if (error || !data.user) {
    return { ok: false, errorMessage: error?.message ?? "No se pudo verificar el código." };
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
