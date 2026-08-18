import { useRef, useState } from "react";
import { Camera, User } from "@/components/shared/icons";
import { PhoneScreen, PrimaryAction, ScreenFooter } from "@/components/shared/PhoneScreen";
import { useAppStore } from "@/store/AppStore";

const ABOUT_MAX_LENGTH = 140;

export function ProfileStep({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  const { onboardingDraft, updateOnboardingDraft } = useAppStore();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isSaving, setSaving] = useState(false);

  const canContinue = onboardingDraft.displayName.trim().length >= 2;

  const handlePickPhoto = (file: File | undefined) => {
    if (!file) return;
    updateOnboardingDraft({ avatarUrl: URL.createObjectURL(file) });
  };

  const handleSubmit = async () => {
    setSaving(true);
    await new Promise((resolve) => setTimeout(resolve, 500));
    setSaving(false);
    onNext();
  };

  return (
    <PhoneScreen title="Tu perfil" onBack={onBack}>
      <div className="flex-1 overflow-y-auto px-6 pt-8">
        <h2 className="text-[26px] font-bold tracking-tight">Crea tu perfil</h2>
        <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
          Así te verán tus contactos dentro de la app.
        </p>

        <div className="mt-8 flex justify-center">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="press relative grid size-28 place-items-center overflow-hidden rounded-full border border-border bg-secondary"
            aria-label="Elegir foto de perfil"
          >
            {onboardingDraft.avatarUrl ? (
              <img
                src={onboardingDraft.avatarUrl}
                alt="Foto de perfil"
                className="size-full object-cover"
              />
            ) : (
              <User className="size-10 text-muted-foreground" />
            )}
            <span className="absolute right-0 bottom-0 grid size-9 place-items-center rounded-full border-2 border-background bg-primary">
              <Camera className="size-4 text-primary-foreground" />
            </span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => handlePickPhoto(event.target.files?.[0])}
          />
        </div>

        <div className="mt-8 space-y-4">
          <label className="block">
            <span className="mb-2 block text-[13px] font-medium tracking-tight text-muted-foreground uppercase">
              Nombre
            </span>
            <input
              value={onboardingDraft.displayName}
              onChange={(event) => updateOnboardingDraft({ displayName: event.target.value })}
              placeholder="¿Cómo te llamas?"
              autoComplete="name"
              className="h-14 w-full rounded-2xl border border-border bg-surface px-4 text-[17px] outline-none focus:border-primary focus:ring-2 focus:ring-ring/30"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-[13px] font-medium tracking-tight text-muted-foreground uppercase">
              Acerca de
            </span>
            <textarea
              value={onboardingDraft.about}
              onChange={(event) =>
                updateOnboardingDraft({ about: event.target.value.slice(0, ABOUT_MAX_LENGTH) })
              }
              rows={3}
              placeholder="Disponible"
              className="w-full resize-none rounded-2xl border border-border bg-surface px-4 py-3 text-[16px] leading-relaxed outline-none focus:border-primary focus:ring-2 focus:ring-ring/30"
            />
            <span className="mt-1 block text-right font-mono text-[12px] text-muted-foreground">
              {onboardingDraft.about.length}/{ABOUT_MAX_LENGTH}
            </span>
          </label>
        </div>
      </div>

      <ScreenFooter>
        <PrimaryAction onClick={handleSubmit} disabled={!canContinue} loading={isSaving}>
          Continuar
        </PrimaryAction>
      </ScreenFooter>
    </PhoneScreen>
  );
}
