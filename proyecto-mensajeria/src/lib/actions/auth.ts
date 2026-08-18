/**
 * Acciones aisladas y reutilizables del flujo de autenticación.
 * Fase 1: simuladas en cliente. Fase 2: mismas firmas contra backend real.
 */

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
}

/** Envía (simula) el código OTP al celular. */
export async function requestPhoneOtp(input: RequestPhoneOtpInput): Promise<RequestPhoneOtpResult> {
  await delay(SIMULATED_LATENCY_MS);
  if (!input.phoneNumber.startsWith("+")) {
    return { ok: false, resendAvailableInSeconds: 0 };
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
}

/** Verifica el OTP. Simulado: acepta cualquier código de 6 dígitos. */
export async function verifyPhoneOtp(input: VerifyOtpInput): Promise<VerifyOtpResult> {
  await delay(SIMULATED_LATENCY_MS);
  const isSixDigits = /^\d{6}$/.test(input.code);
  return isSixDigits
    ? { ok: true }
    : { ok: false, errorMessage: "El código debe tener 6 dígitos." };
}

export interface RequestEmailVerificationInput {
  email: string;
}

/** Envía (simula) el código/enlace de verificación al correo. */
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
