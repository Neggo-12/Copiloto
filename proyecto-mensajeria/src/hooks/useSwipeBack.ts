import { useCallback, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

/** Zona activa desde el borde izquierdo y distancia mínima para confirmar el gesto. */
const EDGE_WIDTH_PX = 40;
const CONFIRM_DISTANCE_PX = 72;

/**
 * Gesto nativo iOS "deslizar desde el borde izquierdo para regresar".
 * Aislado y reutilizable: cualquier pantalla secundaria puede invocarlo y
 * obtiene el mismo comportamiento que el botón de regreso del encabezado.
 */
export function useSwipeBack(onBack: () => void) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);

  const reset = useCallback(() => {
    start.current = null;
    setDragging(false);
    setDragX(0);
  }, []);

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    if (event.clientX - bounds.left > EDGE_WIDTH_PX) return;
    start.current = { x: event.clientX, y: event.clientY };
    setDragging(true);
  }, []);

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const origin = start.current;
    if (!origin) return;
    const dx = event.clientX - origin.x;
    const dy = event.clientY - origin.y;
    // Un desplazamiento vertical dominante es scroll, no navegación.
    if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 12) {
      start.current = null;
      setDragging(false);
      setDragX(0);
      return;
    }
    setDragX(Math.max(0, dx));
  }, []);

  const onPointerUp = useCallback(() => {
    if (start.current && dragX >= CONFIRM_DISTANCE_PX) {
      reset();
      onBack();
      return;
    }
    reset();
  }, [dragX, onBack, reset]);

  return {
    dragX,
    dragging,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: reset,
    },
  };
}
