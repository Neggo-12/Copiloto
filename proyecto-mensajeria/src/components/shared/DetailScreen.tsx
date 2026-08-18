import type { ReactNode } from "react";
import { PhoneScreen } from "@/components/shared/PhoneScreen";
import { useSwipeBack } from "@/hooks/useSwipeBack";

/**
 * Patrón reutilizable de "pantalla de detalle" dentro de cualquier pestaña:
 * encabezado con botón de regreso + gesto de swipe-back desde el borde izquierdo.
 * Lo usan el chat individual y el editor de notas, y lo usarán el detalle de
 * contacto y cualquier pantalla secundaria futura.
 */
export function DetailScreen({
  onBack,
  title,
  heading,
  trailing,
  className,
  children,
}: {
  onBack: () => void;
  title?: string;
  heading?: ReactNode;
  trailing?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const { dragX, dragging, handlers } = useSwipeBack(onBack);

  return (
    <div
      {...handlers}
      className="h-full touch-pan-y"
      style={{
        transform: dragX ? `translateX(${dragX}px)` : undefined,
        transition: dragging ? "none" : "transform 200ms ease-out",
      }}
    >
      <PhoneScreen
        onBack={onBack}
        {...(title !== undefined ? { title } : {})}
        {...(heading !== undefined ? { heading } : {})}
        {...(trailing !== undefined ? { trailing } : {})}
        {...(className !== undefined ? { className } : {})}
      >
        {children}
      </PhoneScreen>
    </div>
  );
}
