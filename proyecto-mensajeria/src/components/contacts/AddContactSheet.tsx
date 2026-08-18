import { useState } from "react";
import { BottomSheet } from "@/components/shared/BottomSheet";
import { PrimaryAction } from "@/components/shared/PhoneScreen";
import { COUNTRIES, DEFAULT_COUNTRY_CODE, findCountry } from "@/lib/domain/countries";
import type { ContactsController } from "@/hooks/useContacts";
import type { ContactId } from "@/lib/domain/types";

/** Alta manual de un contacto: número obligatorio, nombre opcional. */
export function AddContactSheet({
  open,
  controller,
  onClose,
  onAdded,
}: {
  open: boolean;
  controller: ContactsController;
  onClose: () => void;
  onAdded: (contactId: ContactId) => void;
}) {
  const [countryCode, setCountryCode] = useState(DEFAULT_COUNTRY_CODE);
  const [nationalNumber, setNationalNumber] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const country = findCountry(countryCode);

  function reset() {
    setNationalNumber("");
    setDisplayName("");
    setError(null);
  }

  function handleSubmit() {
    const result = controller.addManualContact({ nationalNumber, displayName, countryCode });
    if (result.error || !result.contact) {
      setError(result.error ?? "No pudimos guardar el contacto.");
      return;
    }
    reset();
    onAdded(result.contact.id);
  }

  return (
    <BottomSheet
      open={open}
      title="Agregar contacto"
      onClose={() => {
        reset();
        onClose();
      }}
      footer={
        <PrimaryAction onClick={handleSubmit} disabled={nationalNumber.trim().length === 0}>
          Guardar contacto
        </PrimaryAction>
      }
    >
      <div className="space-y-4 px-5 py-4">
        <div>
          <label
            htmlFor="contact-phone"
            className="block pb-1.5 text-[13px] font-medium text-muted-foreground"
          >
            Número de celular
          </label>
          <div className="flex items-center gap-2">
            <select
              aria-label="País"
              value={countryCode}
              onChange={(event) => setCountryCode(event.target.value)}
              className="touch-target rounded-2xl border border-border bg-secondary px-3 text-[16px] outline-none"
            >
              {COUNTRIES.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.flag} {item.dialCode}
                </option>
              ))}
            </select>
            <input
              id="contact-phone"
              inputMode="numeric"
              autoComplete="tel-national"
              value={nationalNumber}
              onChange={(event) => {
                setNationalNumber(event.target.value.replace(/\D/g, ""));
                setError(null);
              }}
              placeholder={"0".repeat(country.nationalDigits)}
              className="touch-target min-w-0 flex-1 rounded-2xl border border-border bg-secondary px-3 font-mono text-[16px] outline-none placeholder:text-muted-foreground"
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="contact-name"
            className="block pb-1.5 text-[13px] font-medium text-muted-foreground"
          >
            Nombre (opcional)
          </label>
          <input
            id="contact-name"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="Ej. Camila Restrepo"
            className="touch-target w-full rounded-2xl border border-border bg-secondary px-3 text-[16px] outline-none placeholder:text-muted-foreground"
          />
        </div>

        {error && <p className="text-[14px] text-destructive">{error}</p>}
      </div>
    </BottomSheet>
  );
}
