import { cn } from "@/lib/utils";

/**
 * Hoja de confirmación nativa reutilizable para acciones destructivas
 * (cerrar sesión, cerrar sesión en un dispositivo, eliminar).
 */
export function ConfirmSheet({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancelar",
  destructive = true,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label="Cerrar"
        onClick={onCancel}
        className="absolute inset-0 bg-foreground/30 backdrop-blur-[2px]"
      />
      <div className="safe-bottom relative mx-3 mb-3 animate-in slide-in-from-bottom duration-300 space-y-2 rounded-3xl border border-border bg-surface p-4 shadow-sheet">
        <div className="px-2 pt-1 pb-2 text-center">
          <h2 className="text-[17px] font-semibold tracking-tight">{title}</h2>
          {description && (
            <p className="mt-1 text-[14px] leading-relaxed text-muted-foreground">{description}</p>
          )}
        </div>
        <button
          type="button"
          onClick={onConfirm}
          className={cn(
            "press touch-target w-full rounded-2xl text-[17px] font-semibold",
            destructive
              ? "bg-destructive text-destructive-foreground"
              : "bg-primary text-primary-foreground",
          )}
        >
          {confirmLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="press touch-target w-full rounded-2xl border border-border text-[17px] font-medium active:bg-secondary"
        >
          {cancelLabel}
        </button>
      </div>
    </div>
  );
}
