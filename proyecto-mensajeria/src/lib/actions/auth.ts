/**
 * Acciones aisladas y reutilizables del flujo de autenticación.
 * Fase 2: verificación telefónica contra Supabase Auth real (Test OTP mientras
 * no haya proveedor de SMS de producción — ver docs/decisions/README.md).
 * La verificación de correo sigue simulada por ahora (secundaria en la spec).
 */
import { supabase } from "@/lib/supabase/client";

const SIMULATED_LATENCY_MS = 900;

export const OTP_LENGTH = 6;
export const OTP_RESEND_SECONDS = 60;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface RequestPhoneOtpInput {
  phoneNumber: string; // E.164
}
export interface RequestPhoneOtpResult {
  ok: boolean;
  resendAvailableInSeconds: number;
  errorMessage?: string;
}

/** Pide a Supabase Auth que envíe (o, con Test OTP, simule) el código por SMS. */
export async function requestPhoneOtp(input: RequestPhoneOtpInput): Promise<RequestPhoneOtpResult> {
  if (!input.phoneNumber.startsWith("+")) {
    return { ok: false, resendAvailableInSeconds: 0, errorMessage: "Número inválido." };
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
