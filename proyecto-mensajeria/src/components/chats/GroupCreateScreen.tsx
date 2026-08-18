import { Camera, Users, X } from "@/components/shared/icons";
import { useState } from "react";
import { Avatar } from "@/components/shared/Avatar";
import { DetailScreen } from "@/components/shared/DetailScreen";
import { PrimaryAction, ScreenFooter } from "@/components/shared/PhoneScreen";
import { GROUP_NAME_MAX_LENGTH } from "@/lib/actions/groups";
import type { Contact } from "@/lib/domain/types";

/** Pantalla de creación: nombre del grupo, foto opcional y participantes elegidos. */
export function GroupCreateScreen({
  members,
  onRemoveMember,
  onBack,
  onCreate,
}: {
  members: Contact[];
  onRemoveMember: (contact: Contact) => void;
  onBack: () => void;
  onCreate: (name: string, avatarUrl: string | null) => string | null;
}) {
  const [name, setName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <DetailScreen onBack={onBack} title="Nuevo grupo" className="justify-between">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-6">
        <div className="flex items-center gap-4">
          <label className="relative cursor-pointer">
            {avatarUrl ? (
              <Avatar name={name || "Grupo"} avatarUrl={avatarUrl} size="lg" />
            ) : (
              <span className="grid size-14 place-items-center rounded-full border border-border bg-accent text-accent-foreground">
                <Users className="size-6" />
              </span>
            )}
            <span className="absolute -right-1 -bottom-1 grid size-6 place-items-center rounded-full bg-primary text-primary-foreground">
              <Camera className="size-3.5" />
            </span>
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) setAvatarUrl(URL.createObjectURL(file));
              }}
            />
          </label>

          <input
            value={name}
            onChange={(event) => {
              setName(event.target.value.slice(0, GROUP_NAME_MAX_LENGTH));
              setError(null);
            }}
            placeholder="Nombre del grupo"
            className="touch-target min-w-0 flex-1 border-b border-border bg-transparent text-[17px] font-semibold tracking-tight outline-none placeholder:font-normal placeholder:text-muted-foreground"
          />
        </div>

        <p className="mt-2 text-right font-mono text-[12px] text-muted-foreground">
          {name.length}/{GROUP_NAME_MAX_LENGTH}
        </p>
        {error && <p className="mt-1 text-[14px] text-destructive">{error}</p>}

        <h2 className="mt-7 text-[12px] font-semibold tracking-wide text-muted-foreground uppercase">
          Participantes · {members.length}
        </h2>
        <ul className="mt-2 divide-y divide-border/70">
          {members.map((contact) => (
            <li key={contact.id} className="flex items-center gap-3 py-3">
              <Avatar name={contact.displayName} avatarUrl={contact.avatarUrl} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[16px] font-medium">
                  {contact.displayName}
                </span>
                <span className="block truncate font-mono text-[13px] text-muted-foreground">
                  {contact.phoneNumber}
                </span>
              </span>
              <button
                type="button"
                aria-label={`Quitar a ${contact.displayName}`}
                onClick={() => onRemoveMember(contact)}
                className="press touch-target grid place-items-center rounded-full text-muted-foreground active:bg-secondary"
              >
                <X className="size-5" />
              </button>
            </li>
          ))}
        </ul>
      </div>

      <ScreenFooter>
        <PrimaryAction
          onClick={() => {
            const result = onCreate(name, avatarUrl);
            if (result) setError(result);
          }}
        >
          Crear grupo
        </PrimaryAction>
      </ScreenFooter>
    </DetailScreen>
  );
}
