import { useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface SwipeAction {
  label: string;
  icon: ReactNode;
  onAction: () => void;
  variant?: "default" | "destructive";
}

const ACTION_WIDTH = 76;

/** Fila con gesto de deslizar a la izquierda para revelar acciones. */
export function SwipeableRow({
  children,
  actions,
}: {
  children: ReactNode;
  actions: SwipeAction[];
}) {
  const maxOffset = actions.length * ACTION_WIDTH;
  const [offset, setOffset] = useState(0);
  const startX = useRef<number | null>(null);
  const dragging = useRef(false);

  const onPointerDown = (event: React.PointerEvent) => {
    startX.current = event.clientX;
    dragging.current = true;
  };

  const onPointerMove = (event: React.PointerEvent) => {
    if (!dragging.current || startX.current === null) return;
    const delta = event.clientX - startX.current;
    const base = offset;
    const next = Math.min(0, Math.max(-maxOffset, base + delta - (base ? 0 : 0)));
    if (Math.abs(delta) > 6) setOffset(Math.min(0, Math.max(-maxOffset, delta + (base || 0))));
    else setOffset(next);
  };

  const onPointerUp = () => {
    dragging.current = false;
    startX.current = null;
    setOffset((current) => (current < -maxOffset / 2 ? -maxOffset : 0));
  };

  return (
    <div className="relative overflow-hidden">
      <div className="absolute inset-y-0 right-0 flex">
        {actions.map((action) => (
          <button
            key={action.label}
            type="button"
            onClick={() => {
              setOffset(0);
              action.onAction();
            }}
            style={{ width: ACTION_WIDTH }}
            className={cn(
              "flex flex-col items-center justify-center gap-1 text-[12px] font-medium",
              action.variant === "destructive"
                ? "bg-destructive text-destructive-foreground"
                : "bg-secondary text-secondary-foreground",
            )}
          >
            {action.icon}
            {action.label}
          </button>
        ))}
      </div>
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{ transform: `translate3d(${offset}px,0,0)` }}
        className="relative bg-surface transition-transform duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] will-change-transform"
      >
        {children}
      </div>
    </div>
  );
}
