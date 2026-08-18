import { Camera, Check, ChevronRight, ImageIcon, TextT } from "@/components/shared/icons";
import { useState } from "react";
import { DetailScreen } from "@/components/shared/DetailScreen";
import { PrimaryAction } from "@/components/shared/PhoneScreen";
import { RecipientPicker } from "@/components/chats/RecipientPicker";
import {
  STATUS_AUDIENCE_OPTIONS,
  STATUS_BACKGROUNDS,
  buildAudience,
  describeAudience,
} from "@/lib/actions/status";
import type { PublishStatusInput } from "@/lib/actions/status";
import statusSample from "@/assets/status-sample.jpg";
import type { Contact, StatusAudience, StatusAudienceMode, StatusKind } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

/** Pantalla de creación de estado: foto/video simulada o texto con fondo. */
export function StatusComposerScreen({
  contacts,
  onBack,
  onPublish,
}: {
  contacts: Contact[];
  onBack: () => void;
  onPublish: (input: PublishStatusInput) => void;
}) {
  const [kind, setKind] = useState<StatusKind>("text");
  const [body, setBody] = useState("");
  const [backgroundColor, setBackgroundColor] = useState(STATUS_BACKGROUNDS[0]!.color);
  const [audience, setAudience] = useState<StatusAudience>({ mode: "all", contactIds: [] });
  const [pickerMode, setPickerMode] = useState<StatusAudienceMode | null>(null);

  const canPublish = kind === "media" || body.trim().length > 0;

  return (
    <DetailScreen onBack={onBack} title="Nuevo estado">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {/* Tipo de estado */}
        <div className="grid grid-cols-2 gap-2">
          <TypeChip
            active={kind === "text"}
            icon={<TextT className="size-5" />}
            label="Texto"
            onClick={() => setKind("text")}
          />
          <TypeChip
            active={kind === "media"}
            icon={<ImageIcon className="size-5" />}
            label="Foto o video"
            onClick={() => setKind("media")}
          />
        </div>

        {/* Previsualización */}
        {kind === "text" ? (
          <div
            className="grid min-h-56 place-items-center rounded-3xl px-6 py-8"
            style={{ backgroundColor }}
          >
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              rows={3}
              placeholder="Escribe tu estado…"
              className="w-full resize-none bg-transparent text-center text-[22px] leading-snug font-semibold tracking-tight text-white outline-none placeholder:text-white/70"
            />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="overflow-hidden rounded-3xl border border-border">
              <img
                src={statusSample}
                alt="Vista previa del estado"
                loading="lazy"
                width={720}
                height={1280}
                className="h-56 w-full object-cover"
              />
            </div>
            {/* Simulación: cámara y galería devuelven la misma imagen de ejemplo. */}
            <div className="grid grid-cols-2 gap-2">
              <TypeChip
                active
                icon={<Camera className="size-5" />}
                label="Cámara"
                onClick={() => {}}
              />
              <TypeChip
                active={false}
                icon={<ImageIcon className="size-5" />}
                label="Galería"
                onClick={() => {}}
              />
            </div>
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-medium text-muted-foreground">
                Leyenda (opcional)
              </span>
              <input
                value={body}
                onChange={(event) => setBody(event.target.value)}
                placeholder="Agrega una leyenda"
                className="touch-target w-full rounded-2xl border border-border bg-secondary px-3 text-[16px] outline-none placeholder:text-muted-foreground"
              />
            </label>
          </div>
        )}

        {/* Colores de fondo de marca */}
        {kind === "text" && (
          <div className="flex items-center gap-3 px-1">
            {STATUS_BACKGROUNDS.map((option) => (
              <button
                key={option.id}
                type="button"
                aria-label={option.label}
                onClick={() => setBackgroundColor(option.color)}
                className={cn(
                  "press grid size-10 place-items-center rounded-full border-2",
                  backgroundColor === option.color ? "border-primary" : "border-transparent",
                )}
              >
                <span
                  className="size-7 rounded-full border border-border/40"
                  style={{ backgroundColor: option.color }}
                />
              </button>
            ))}
          </div>
        )}

        {/* Audiencia */}
        <section className="overflow-hidden rounded-2xl border border-border">
          <p className="border-b border-border/70 bg-secondary px-4 py-2 text-[13px] font-semibold tracking-tight">
            ¿Quién lo puede ver?
          </p>
          <ul className="divide-y divide-border/70">
            {STATUS_AUDIENCE_OPTIONS.map((option) => (
              <li key={option.mode}>
                <button
                  type="button"
                  onClick={() => {
                    if (option.mode === "all") setAudience(buildAudience("all", []));
                    else setPickerMode(option.mode);
                  }}
                  className="touch-target flex w-full items-center gap-3 px-4 text-left active:bg-secondary"
                >
                  <span className="flex-1 text-[15px] font-medium">{option.label}</span>
                  {audience.mode === option.mode ? (
                    <Check className="size-5 text-primary" />
                  ) : (
                    <ChevronRight className="size-4 text-muted-foreground" />
                  )}
                </button>
              </li>
            ))}
          </ul>
          <p className="border-t border-border/70 px-4 py-2 text-[13px] text-muted-foreground">
            {describeAudience(audience)}
          </p>
        </section>
      </div>

      <div className="safe-bottom shrink-0 border-t border-border/70 bg-surface/90 px-4 pt-3 backdrop-blur">
        <PrimaryAction
          disabled={!canPublish}
          onClick={() =>
            onPublish({
              kind,
              body,
              backgroundColor: kind === "text" ? backgroundColor : null,
              mediaUrl: kind === "media" ? statusSample : null,
              audience,
            })
          }
        >
          Publicar
        </PrimaryAction>
      </div>

      <RecipientPicker
        open={pickerMode !== null}
        title={pickerMode === "only" ? "Compartir solo con" : "Excepto"}
        contacts={contacts}
        multiSelect
        confirmLabel="Listo"
        onConfirmSelection={(selected) => {
          if (pickerMode) {
            setAudience(
              buildAudience(
                pickerMode,
                selected.map((contact) => contact.id),
              ),
            );
          }
          setPickerMode(null);
        }}
        onClose={() => setPickerMode(null)}
      />
    </DetailScreen>
  );
}

function TypeChip({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "press touch-target flex items-center justify-center gap-2 rounded-2xl border text-[15px] font-medium",
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border bg-secondary text-foreground",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
