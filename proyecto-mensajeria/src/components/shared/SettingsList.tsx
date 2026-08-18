import { ChevronRight } from "@/components/shared/icons";
import type { ComponentType, ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Bloque de ajustes con título opcional y filas separadas por 1px. */
export function SettingsSection({
  title,
  footnote,
  children,
}: {
  title?: string;
  footnote?: string;
  children: ReactNode;
}) {
  return (
    <section className="px-4 pt-6">
      {title && (
        <h2 className="mb-2 px-2 text-[13px] font-semibold tracking-tight text-muted-foreground uppercase">
          {title}
        </h2>
      )}
      <div className="divide-y divide-border/70 overflow-hidden rounded-2xl border border-border bg-surface">
        {children}
      </div>
      {footnote && (
        <p className="mt-2 px-2 text-[13px] leading-relaxed text-muted-foreground">{footnote}</p>
      )}
    </section>
  );
}

/** Fila navegable hacia una subpantalla. */
export function SettingsRow({
  icon: Icon,
  label,
  value,
  onClick,
  destructive = false,
}: {
  icon?: ComponentType<{ className?: string }>;
  label: string;
  value?: string;
  onClick?: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="press touch-target flex w-full items-center gap-3 px-4 py-3.5 text-left active:bg-secondary"
    >
      {Icon && (
        <Icon className={cn("size-5 shrink-0", destructive ? "text-destructive" : "text-primary")} />
      )}
      <span
        className={cn(
          "flex-1 text-[16px] font-medium tracking-tight",
          destructive && "text-destructive",
        )}
      >
        {label}
      </span>
      {value && <span className="text-[15px] text-muted-foreground">{value}</span>}
      {onClick && !destructive && <ChevronRight className="size-5 text-muted-foreground" />}
    </button>
  );
}

/** Fila de solo lectura (ej. celular y correo verificados). */
export function ReadOnlyRow({
  icon: Icon,
  label,
  value,
  mono = false,
}: {
  icon?: ComponentType<{ className?: string }>;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5">
      {Icon && <Icon className="size-5 shrink-0 text-muted-foreground" />}
      <span className="flex-1 text-[16px] font-medium tracking-tight">{label}</span>
      <span className={cn("text-[15px] text-muted-foreground", mono && "font-mono")}>
        {value}
      </span>
    </div>
  );
}

/** Interruptor accesible de 44px de alto mínimo. */
export function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="press touch-target flex w-full items-center gap-3 px-4 py-3.5 text-left active:bg-secondary"
    >
      <span className="flex-1">
        <span className="block text-[16px] font-medium tracking-tight">{label}</span>
        {description && (
          <span className="mt-0.5 block text-[13px] leading-snug text-muted-foreground">
            {description}
          </span>
        )}
      </span>
      <span
        className={cn(
          "relative h-7 w-12 shrink-0 rounded-full transition-colors",
          checked ? "bg-primary" : "bg-secondary border border-border",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 size-6 rounded-full bg-background shadow-sm transition-all",
            checked ? "left-[22px]" : "left-0.5",
          )}
        />
      </span>
    </button>
  );
}

/** Selector segmentado de una sola opción (usado por privacidad). */
export function OptionPicker<T extends string>({
  label,
  description,
  value,
  options,
  onChange,
}: {
  label: string;
  description?: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (next: T) => void;
}) {
  return (
    <div className="px-4 py-3.5">
      <p className="text-[16px] font-medium tracking-tight">{label}</p>
      {description && (
        <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">{description}</p>
      )}
      <div
        role="radiogroup"
        aria-label={label}
        className="mt-3 flex gap-1 rounded-xl bg-secondary p-1"
      >
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={value === option.value}
            onClick={() => onChange(option.value)}
            className={cn(
              "press min-h-11 flex-1 rounded-lg px-2 text-[14px] font-medium tracking-tight transition-colors",
              value === option.value
                ? "bg-surface text-foreground shadow-sm"
                : "text-muted-foreground",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
