import { useCallback, useEffect, useState } from "react";
import { PhoneScreen, PrimaryAction, ScreenFooter } from "@/components/shared/PhoneScreen";
import { OtpInput } from "@/components/shared/OtpInput";
import {
  OTP_LENGTH,
  OTP_RESEND_SECONDS,
  requestPhoneOtp,
  verifyPhoneOtp,
} from "@/lib/actions/auth";
import { useAppStore } from "@/store/AppStore";

export function OtpStep({ onBack, onVerified }: { onBack: () => void; onVerified: () => void }) {
  const { onboardingDraft } = useAppStore();
  const [code, setCode] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isVerifying, setVerifying] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(OTP_RESEND_SECONDS);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setTimeout(() => setSecondsLeft((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  const submitCode = useCallback(
    async (submitted: string) => {
      setVerifying(true);
      setErrorMessage(null);
      const result = await verifyPhoneOtp({
        phoneNumber: onboardingDraft.phoneNumber,
        code: submitted,
      });
      setVerifying(false);
      if (result.ok) onVerified();
      else setErrorMessage(result.errorMessage ?? "Código inválido.");
    },
    [onboardingDraft.phoneNumber, onVerified],
  );

  const handleResend = async () => {
    setCode("");
    setErrorMessage(null);
    setSecondsLeft(OTP_RESEND_SECONDS);
    await requestPhoneOtp({ phoneNumber: onboardingDraft.phoneNumber });
  };

  return (
    <PhoneScreen title="Código de verificación" onBack={onBack}>
      <div className="flex-1 overflow-y-auto px-6 pt-8">
        <h2 className="text-[26px] font-bold tracking-tight">Ingresa el código</h2>
        <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
          Enviamos un código de 6 dígitos a{" "}
          <span className="font-mono text-foreground">{onboardingDraft.phoneNumber}</span>.
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

        <div className="mt-8 text-center">
          {secondsLeft > 0 ? (
            <p className="text-[14px] text-muted-foreground">
              Reenviar código en{" "}
              <span className="font-mono tabular-nums text-foreground">
                0:{String(secondsLeft).padStart(2, "0")}
              </span>
            </p>
          ) : (
            <button
              type="button"
              onClick={handleResend}
              className="press touch-target px-4 text-[15px] font-semibold text-primary"
            >
              Reenviar código
            </button>
          )}
        </div>
      </div>

      <ScreenFooter>
        <PrimaryAction
          onClick={() => submitCode(code)}
          disabled={code.length !== OTP_LENGTH}
          loading={isVerifying}
        >
          Verificar
        </PrimaryAction>
      </ScreenFooter>
    </PhoneScreen>
  );
}
