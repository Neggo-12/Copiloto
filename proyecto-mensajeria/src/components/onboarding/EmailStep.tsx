import { useCallback, useState } from "react";
import { Mail } from "@/components/shared/icons";
import { PhoneScreen, PrimaryAction, ScreenFooter } from "@/components/shared/PhoneScreen";
import { OtpInput } from "@/components/shared/OtpInput";
import {
  OTP_LENGTH,
  isValidEmail,
  requestEmailVerification,
  verifyEmailCode,
} from "@/lib/actions/auth";
import { useAppStore } from "@/store/AppStore";

export function EmailStep({ onBack, onSent }: { onBack: () => void; onSent: () => void }) {
  const { onboardingDraft, updateOnboardingDraft } = useAppStore();
  const [isSending, setSending] = useState(false);
  const email = onboardingDraft.email;
  const isValid = isValidEmail(email);

  const handleSubmit = async () => {
    if (!isValid) return;
    setSending(true);
    const result = await requestEmailVerification({ email: email.trim() });
    setSending(false);
    if (result.ok) onSent();
  };

  return (
    <PhoneScreen title="Tu correo" onBack={onBack}>
      <div className="flex-1 overflow-y-auto px-6 pt-8">
        <h2 className="text-[26px] font-bold tracking-tight">Agrega tu correo</h2>
        <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
          Lo usamos para recuperar tu cuenta y confirmar cambios de seguridad.
        </p>

        <div className="mt-8 flex items-center gap-3 rounded-2xl border border-border bg-surface px-4">
          <Mail className="size-5 shrink-0 text-muted-foreground" />
          <input
            value={email}
            onChange={(event) => updateOnboardingDraft({ email: event.target.value })}
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="tu@correo.com"
            aria-label="Correo electrónico"
            className="h-14 min-w-0 flex-1 bg-transparent text-[17px] outline-none placeholder:text-muted-foreground/60"
          />
        </div>

        {email.length > 0 && !isValid && (
          <p className="mt-3 text-[13px] text-destructive">Ingresa un correo válido.</p>
        )}
      </div>

      <ScreenFooter>
        <PrimaryAction onClick={handleSubmit} disabled={!isValid} loading={isSending}>
          Enviar verificación
        </PrimaryAction>
      </ScreenFooter>
    </PhoneScreen>
  );
}

export function EmailVerifyStep({
  onBack,
  onVerified,
}: {
  onBack: () => void;
  onVerified: () => void;
}) {
  const { onboardingDraft } = useAppStore();
  const [code, setCode] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isVerifying, setVerifying] = useState(false);

  const submitCode = useCallback(
    async (submitted: string) => {
      setVerifying(true);
      setErrorMessage(null);
      const result = await verifyEmailCode({ email: onboardingDraft.email, code: submitted });
      setVerifying(false);
      if (result.ok) onVerified();
      else setErrorMessage(result.errorMessage ?? "Código inválido.");
    },
    [onboardingDraft.email, onVerified],
  );

  return (
    <PhoneScreen title="Verificar correo" onBack={onBack}>
      <div className="flex-1 overflow-y-auto px-6 pt-8">
        <h2 className="text-[26px] font-bold tracking-tight">Revisa tu bandeja</h2>
        <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
          Enviamos un enlace y un código de 6 dígitos a{" "}
          <span className="text-foreground">{onboardingDraft.email}</span>. Toca el enlace o
          escribe el código.
        </p>

        <div className="mt-9">
          <OtpInput
            value={code}
            onChange={setCode}
            onComplete={submitCode}
            hasError={Boolean(errorMessage)}
            disabled={isVerifying}
          />
        </div>

        {errorMessage && (
          <p className="mt-4 text-center text-[13px] text-destructive">{errorMessage}</p>
        )}

        <button
          type="button"
          onClick={() => submitCode("123456")}
          className="press touch-target mt-8 w-full text-center text-[15px] font-semibold text-primary"
        >
          Ya toqué el enlace del correo
        </button>
      </div>

      <ScreenFooter>
        <PrimaryAction
          onClick={() => submitCode(code)}
          disabled={code.length !== OTP_LENGTH}
          loading={isVerifying}
        >
          Verificar correo
        </PrimaryAction>
      </ScreenFooter>
    </PhoneScreen>
  );
}
