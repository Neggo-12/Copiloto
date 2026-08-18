import { ChevronLeft, Moon, Sun } from "@/components/shared/icons";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/AppStore";

/** Contenedor de pantalla a pantalla completa con áreas seguras y transición nativa. */
export function PhoneScreen({
  children,
  className,
  onBack,
  title,
  heading,
  trailing,
  showThemeToggle = false,
}: {
  children: ReactNode;
  className?: string;
  onBack?: () => void;
  title?: string;
  /** Contenido central personalizado (ej. avatar + nombre + estado). */
  heading?: ReactNode;
  trailing?: ReactNode;
  showThemeToggle?: boolean;
}) {
  const { theme, toggleTheme } = useAppStore();

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-background text-foreground">
      {(onBack || title || heading || trailing || showThemeToggle) && (
        <header className="safe-top grid shrink-0 grid-cols-[44px_minmax(0,1fr)_44px] items-center gap-2 border-b border-border/70 bg-surface/80 px-2 pb-2 backdrop-blur">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              aria-label="Volver"
              className="press touch-target grid place-items-center rounded-full text-foreground active:bg-secondary"
            >
              <ChevronLeft className="size-6" />
            </button>
          ) : (
            <span />
          )}
          {heading ?? (
            <h1 className="truncate text-center text-[17px] font-semibold tracking-tight">
              {title}
            </h1>
          )}

          {trailing ??
            (showThemeToggle ? (
              <button
                type="button"
                onClick={toggleTheme}
                aria-label="Cambiar tema"
                className="press touch-target grid place-items-center rounded-full text-muted-foreground active:bg-secondary"
              >
                {theme === "dark" ? <Sun className="size-5" /> : <Moon className="size-5" />}
              </button>
            ) : (
              <span />
            ))}
        </header>
      )}
      <main className={cn("screen-enter relative flex min-h-0 flex-1 flex-col", className)}>
        {children}
      </main>
    </div>
  );
}

/** Zona de acciones fija al pie, respetando el home indicator. */
export function ScreenFooter({ children }: { children: ReactNode }) {
  return (
    <div className="safe-bottom mt-auto shrink-0 space-y-3 border-t border-border/60 bg-surface/80 px-5 pt-4 backdrop-blur">
      {children}
    </div>
  );
}

export function PrimaryAction({
  children,
  onClick,
  disabled,
  loading,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className="press touch-target flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-5 py-3.5 text-[17px] font-semibold text-primary-foreground disabled:opacity-40"
    >
      {loading && (
        <span className="size-4 animate-spin rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground" />
      )}
      {children}
    </button>
  );
}

export function SecondaryAction({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="press touch-target w-full rounded-2xl px-5 py-3 text-[16px] font-medium text-muted-foreground active:bg-secondary"
    >
      {children}
    </button>
  );
}
