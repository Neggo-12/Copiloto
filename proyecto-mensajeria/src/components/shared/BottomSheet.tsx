import type { ReactNode } from "react";
import { X } from "@/components/shared/icons";

/** Hoja inferior modal reutilizable (estilo nativo iOS/Android). */
export function BottomSheet({
  open,
  title,
  onClose,
  children,
  footer,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label="Cerrar"
        onClick={onClose}
        className="absolute inset-0 bg-foreground/30 backdrop-blur-[2px]"
      />
      <div className="relative max-h-[82dvh] animate-in slide-in-from-bottom duration-300 overflow-hidden rounded-t-3xl border border-border bg-surface shadow-sheet">
        <div className="safe-top flex items-center justify-between border-b border-border/70 px-5 pt-4 pb-3">
          <h2 className="text-[17px] font-semibold tracking-tight">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="press touch-target -mr-2 grid place-items-center rounded-full text-muted-foreground active:bg-secondary"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="max-h-[62dvh] overflow-y-auto overscroll-contain">{children}</div>
        {footer ? <div className="safe-bottom border-t border-border/70 p-4">{footer}</div> : null}
      </div>
    </div>
  );
}
