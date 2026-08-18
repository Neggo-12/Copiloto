import { Timer } from "@/components/shared/icons";
import { DISAPPEARING_OPTIONS, describeDisappearingTtl } from "@/lib/actions/chats";
import type { Chat, DisappearingTtlSeconds } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

const DEFAULT_TTL: DisappearingTtlSeconds = 86_400;

/**
 * Bloque reutilizable de "Mensajes que desaparecen": interruptor + duraciones.
 * Se usa en el detalle del chat individual y en el detalle del grupo.
 */
export function DisappearingMessagesSection({
  chat,
  onChange,
}: {
  chat: Chat;
  onChange: (ttlSeconds: DisappearingTtlSeconds | null) => void;
}) {
  const isEnabled = chat.disappearingTtlSeconds !== null;

  return (
    <section className="px-5">
      <h3 className="text-[12px] font-semibold tracking-wide text-muted-foreground uppercase">
        Privacidad del chat
      </h3>

      <div className="mt-2 rounded-2xl border border-border">
        <label className="touch-target flex cursor-pointer items-center gap-3 px-4">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent-warm/15 text-accent-warm">
            <Timer className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[16px] font-medium">Mensajes que desaparecen</span>
            <span className="block font-mono text-[13px] text-muted-foreground">
              {describeDisappearingTtl(chat.disappearingTtlSeconds)}
            </span>
          </span>
          <input
            type="checkbox"
            checked={isEnabled}
            onChange={(event) => onChange(event.target.checked ? DEFAULT_TTL : null)}
            className="size-6 accent-[var(--color-primary)]"
          />
        </label>

        {isEnabled && (
          <div className="flex gap-2 border-t border-border/70 p-3">
            {DISAPPEARING_OPTIONS.map((option) => (
              <button
                key={option.ttlSeconds}
                type="button"
                onClick={() => onChange(option.ttlSeconds)}
                aria-pressed={chat.disappearingTtlSeconds === option.ttlSeconds}
                className={cn(
                  "press touch-target flex-1 rounded-xl border text-[14px] font-medium",
                  chat.disappearingTtlSeconds === option.ttlSeconds
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground active:bg-secondary",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <p className="mt-2 text-[13px] text-muted-foreground">
        Los mensajes nuevos se marcan con un temporizador junto a la hora de envío.
      </p>
    </section>
  );
}
