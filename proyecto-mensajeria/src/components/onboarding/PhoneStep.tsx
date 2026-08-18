import { useState } from "react";
import { Check } from "@/components/shared/icons";
import { PhoneScreen, PrimaryAction, ScreenFooter } from "@/components/shared/PhoneScreen";
import {
  COUNTRIES,
  findCountry,
  formatNationalNumber,
  isValidNationalNumber,
  normalizeNationalNumber,
  toE164,
} from "@/lib/domain/countries";
import { requestPhoneOtp } from "@/lib/actions/auth";
import { useAppStore } from "@/store/AppStore";

export function PhoneStep({ onBack, onSent }: { onBack: () => void; onSent: () => void }) {
  const { onboardingDraft, updateOnboardingDraft } = useAppStore();
  const [isPickerOpen, setPickerOpen] = useState(false);
  const [isSending, setSending] = useState(false);

  const country = findCountry(onboardingDraft.phoneCountryCode);
  const isValid = isValidNationalNumber(onboardingDraft.phoneNationalNumber, country);

  const handleSubmit = async () => {
    if (!isValid) return;
    setSending(true);
    const phoneNumber = toE164(onboardingDraft.phoneNationalNumber, country);
    const result = await requestPhoneOtp({ phoneNumber });
    setSending(false);
    if (result.ok) {
      updateOnboardingDraft({ phoneNumber });
      onSent();
    }
  };

  return (
    <PhoneScreen title="Tu número" onBack={onBack}>
      <div className="flex-1 overflow-y-auto px-6 pt-8">
        <h2 className="text-[26px] font-bold tracking-tight">Verifica tu celular</h2>
        <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
          Te enviaremos un código de 6 dígitos por SMS para confirmar que eres tú.
        </p>

        <div className="mt-8 overflow-hidden rounded-2xl border border-border bg-surface">
          <button
            type="button"
            onClick={() => setPickerOpen((open) => !open)}
            className="press touch-target flex w-full items-center justify-between border-b border-border px-4 py-3 text-left"
          >
            <span className="flex items-center gap-3">
              <span className="text-xl">{country.flag}</span>
              <span className="text-[16px] font-medium">{country.name}</span>
            </span>
            <span className="font-mono text-[15px] text-muted-foreground">
              {country.dialCode}
            </span>
          </button>

          <div className="flex items-center gap-3 px-4">
            <span className="font-mono text-[17px] text-muted-foreground">
              {country.dialCode}
            </span>
            <input
              value={formatNationalNumber(onboardingDraft.phoneNationalNumber)}
              onChange={(event) =>
                updateOnboardingDraft({
                  phoneNationalNumber: normalizeNationalNumber(event.target.value).slice(
                    0,
                    country.nationalDigits,
                  ),
                })
              }
              inputMode="tel"
              autoComplete="tel-national"
              placeholder="300 123 4567"
              aria-label="Número de celular"
              className="h-14 min-w-0 flex-1 bg-transparent font-mono text-[19px] tabular-nums outline-none placeholder:text-muted-foreground/60"
            />
          </div>
        </div>

        {isPickerOpen && (
          <ul className="screen-enter mt-3 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
            {COUNTRIES.map((item) => (
              <li key={item.code}>
                <button
                  type="button"
                  onClick={() => {
                    updateOnboardingDraft({
                      phoneCountryCode: item.code,
                      phoneNationalNumber: "",
                    });
                    setPickerOpen(false);
                  }}
                  className="press touch-target flex w-full items-center gap-3 px-4 py-3 text-left"
                >
                  <span className="text-xl">{item.flag}</span>
                  <span className="min-w-0 flex-1 truncate text-[15px]">{item.name}</span>
                  <span className="font-mono text-[14px] text-muted-foreground">
                    {item.dialCode}
                  </span>
                  {item.code === country.code && <Check className="size-4 text-primary" />}
                </button>
              </li>
            ))}
          </ul>
        )}

        {!isValid && onboardingDraft.phoneNationalNumber.length > 0 && (
          <p className="mt-3 text-[13px] text-destructive">
            El número debe tener {country.nationalDigits} dígitos.
          </p>
        )}
      </div>

      <ScreenFooter>
        <PrimaryAction onClick={handleSubmit} disabled={!isValid} loading={isSending}>
          Enviar código
        </PrimaryAction>
      </ScreenFooter>
    </PhoneScreen>
  );
}
