import { useRef, useState } from "react";
import {
  AtSign,
  Bell,
  Camera,
  Check,
  Helmet,
  Lock,
  LogOut,
  Phone,
  Pencil,
  ShieldCheck,
  User,
} from "@/components/shared/icons";
import type { ReactNode } from "react";
import { PhoneScreen } from "@/components/shared/PhoneScreen";
import { Avatar } from "@/components/shared/Avatar";
import {
  ReadOnlyRow,
  SettingsRow,
  SettingsSection,
} from "@/components/shared/SettingsList";
import { ConfirmSheet } from "@/components/shared/ConfirmSheet";
import {
  ABOUT_MAX_LENGTH,
  REVERIFICATION_NOTICE,
  isValidDisplayName,
} from "@/lib/actions/profile";
import { formatContactPhone } from "@/lib/actions/contacts";
import type { ProfileController } from "@/hooks/useProfile";

export type ProfileSubscreen = "security" | "privacy" | "notifications" | "device";

/** Pantalla principal de la pestaña Perfil/Ajustes. */
export function ProfileScreen({
  controller,
  tabBar,
  onOpenSubscreen,
}: {
  controller: ProfileController;
  tabBar: ReactNode;
  onOpenSubscreen: (screen: ProfileSubscreen) => void;
}) {
  const { currentUser, updateProfile, signOut } = controller;
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isEditing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState(currentUser?.displayName ?? "");
  const [about, setAbout] = useState(currentUser?.about ?? "");
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);

  if (!currentUser) return null;

  const startEditing = () => {
    setDisplayName(currentUser.displayName);
    setAbout(currentUser.about);
    setEditing(true);
  };

  const saveEditing = () => {
    updateProfile({ displayName, about });
    setEditing(false);
  };

  return (
    <PhoneScreen title="Perfil" showThemeToggle className="justify-between">
      <div className="flex-1 overflow-y-auto pb-6">
        {/* Encabezado editable: foto, nombre y acerca de. */}
        <div className="flex flex-col items-center px-6 pt-6">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            aria-label="Cambiar foto de perfil"
            className="press relative"
          >
            <Avatar
              name={currentUser.displayName}
              avatarUrl={currentUser.avatarUrl}
              className="size-24 text-[28px]"
            />
            <span className="absolute right-0 bottom-0 grid size-8 place-items-center rounded-full border-2 border-background bg-primary">
              <Camera className="size-4 text-primary-foreground" />
            </span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) updateProfile({ avatarUrl: URL.createObjectURL(file) });
            }}
          />

          {isEditing ? (
            <div className="mt-5 w-full space-y-3">
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="Tu nombre"
                aria-label="Nombre"
                className="h-13 w-full rounded-2xl border border-border bg-surface px-4 py-3 text-[17px] outline-none focus:border-primary focus:ring-2 focus:ring-ring/30"
              />
              <div>
                <textarea
                  value={about}
                  onChange={(event) => setAbout(event.target.value.slice(0, ABOUT_MAX_LENGTH))}
                  rows={3}
                  placeholder="Acerca de"
                  aria-label="Acerca de"
                  className="w-full resize-none rounded-2xl border border-border bg-surface px-4 py-3 text-[16px] leading-relaxed outline-none focus:border-primary focus:ring-2 focus:ring-ring/30"
                />
                <p className="mt-1 text-right font-mono text-[12px] text-muted-foreground">
                  {about.length}/{ABOUT_MAX_LENGTH}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="press touch-target flex-1 rounded-2xl border border-border text-[16px] font-medium active:bg-secondary"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={saveEditing}
                  disabled={!isValidDisplayName(displayName)}
                  className="press touch-target flex flex-1 items-center justify-center gap-2 rounded-2xl bg-primary text-[16px] font-semibold text-primary-foreground disabled:opacity-40"
                >
                  <Check className="size-4" />
                  Guardar
                </button>
              </div>
            </div>
          ) : (
            <>
              <h2 className="mt-4 text-center text-[24px] font-bold tracking-tight">
                {currentUser.displayName}
              </h2>
              <p className="mt-1 max-w-[280px] text-center text-[15px] leading-relaxed text-muted-foreground">
                {currentUser.about || "Añade algo sobre ti"}
              </p>
              <button
                type="button"
                onClick={startEditing}
                className="press touch-target mt-4 flex items-center gap-2 rounded-full border border-border px-5 text-[15px] font-medium active:bg-secondary"
              >
                <Pencil className="size-4 text-primary" />
                Editar perfil
              </button>
            </>
          )}
        </div>

        {/* Datos verificados: visibles pero no editables aquí. */}
        <SettingsSection title="Cuenta" footnote={REVERIFICATION_NOTICE}>
          <ReadOnlyRow
            icon={Phone}
            label="Celular"
            value={formatContactPhone(currentUser.phoneNumber)}
            mono
          />
          <ReadOnlyRow icon={AtSign} label="Correo" value={currentUser.email ?? "Sin correo"} />
        </SettingsSection>

        <SettingsSection title="Ajustes">
          <SettingsRow
            icon={Helmet}
            label="Casco / Dispositivo"
            onClick={() => onOpenSubscreen("device")}
          />
          <SettingsRow
            icon={ShieldCheck}
            label="Seguridad"
            onClick={() => onOpenSubscreen("security")}
          />
          <SettingsRow icon={Lock} label="Privacidad" onClick={() => onOpenSubscreen("privacy")} />
          <SettingsRow
            icon={Bell}
            label="Notificaciones"
            onClick={() => onOpenSubscreen("notifications")}
          />
        </SettingsSection>

        <SettingsSection>
          <SettingsRow
            icon={LogOut}
            label="Cerrar sesión"
            destructive
            onClick={() => setConfirmingSignOut(true)}
          />
        </SettingsSection>

        <p className="mt-6 flex items-center justify-center gap-1.5 text-[13px] text-muted-foreground">
          <User className="size-3.5" />
          Vozz · versión 1.0.0 (demo)
        </p>
      </div>

      {tabBar}

      <ConfirmSheet
        open={confirmingSignOut}
        title="¿Cerrar sesión?"
        description="Tendrás que verificar de nuevo tu número de celular para volver a entrar."
        confirmLabel="Cerrar sesión"
        onCancel={() => setConfirmingSignOut(false)}
        onConfirm={() => {
          setConfirmingSignOut(false);
          signOut();
        }}
      />
    </PhoneScreen>
  );
}
