import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { OTP_LENGTH } from "@/lib/actions/auth";

/** Campo OTP de 6 dígitos con auto-avance y retroceso. */
export function OtpInput({
  value,
  onChange,
  onComplete,
  hasError,
  disabled,
}: {
  value: string;
  onChange: (next: string) => void;
  onComplete?: (code: string) => void;
  hasError?: boolean;
  disabled?: boolean;
}) {
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    inputsRef.current[0]?.focus();
  }, []);

  const setDigit = (index: number, digit: string) => {
    const chars = value.padEnd(OTP_LENGTH, " ").split("");
    chars[index] = digit || " ";
    const next = chars.join("").replace(/\s/g, " ").trimEnd();
    const cleaned = next.replace(/\s/g, "");
    onChange(cleaned);
    if (digit && index < OTP_LENGTH - 1) inputsRef.current[index + 1]?.focus();
    if (cleaned.length === OTP_LENGTH) onComplete?.(cleaned);
  };

  const handlePaste = (event: React.ClipboardEvent) => {
    const pasted = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, OTP_LENGTH);
    if (!pasted) return;
    event.preventDefault();
    onChange(pasted);
    if (pasted.length === OTP_LENGTH) onComplete?.(pasted);
  };

  return (
    <div className="flex justify-center gap-2" onPaste={handlePaste}>
      {Array.from({ length: OTP_LENGTH }).map((_, index) => (
        <input
          key={index}
          ref={(el) => {
            inputsRef.current[index] = el;
          }}
          value={value[index] ?? ""}
          onChange={(event) => setDigit(index, event.target.value.replace(/\D/g, "").slice(-1))}
          onKeyDown={(event) => {
            if (event.key === "Backspace" && !value[index]) {
              inputsRef.current[index - 1]?.focus();
              setDigit(Math.max(0, index - 1), "");
            }
          }}
          inputMode="numeric"
          autoComplete="one-time-code"
          aria-label={`Dígito ${index + 1}`}
          disabled={disabled}
          className={cn(
            "h-14 w-12 rounded-2xl border bg-surface text-center font-mono text-2xl tabular-nums outline-none transition-colors",
            hasError
              ? "border-destructive text-destructive"
              : "border-border-strong focus:border-primary focus:ring-2 focus:ring-ring/40",
          )}
        />
      ))}
    </div>
  );
}
