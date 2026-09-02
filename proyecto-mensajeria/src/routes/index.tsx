import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { WelcomeStep } from "@/components/onboarding/WelcomeStep";
import { PhoneStep } from "@/components/onboarding/PhoneStep";
import { EmailStep, EmailVerifyStep } from "@/components/onboarding/EmailStep";
import { ProfileStep } from "@/components/onboarding/ProfileStep";
import { PermissionsStep } from "@/components/onboarding/PermissionsStep";
import { ChatsTab } from "@/components/chats/ChatsTab";
import { RemindersTab } from "@/components/reminders/RemindersTab";
import { ContactsTab } from "@/components/contacts/ContactsTab";
import { CopilotoTab } from "@/components/copiloto/CopilotoTab";
import { ProfileTab } from "@/components/profile/ProfileTab";
import { useChats } from "@/hooks/useChats";
import { useContacts } from "@/hooks/useContacts";
import type { ChatId } from "@/lib/domain/types";
import { TabBar, type MainTabKey } from "@/components/shared/TabBar";
import { useAppStore } from "@/store/AppStore";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Vozz — Mensajes y notas de voz en tu celular" },
      {
        name: "description",
        content:
          "App móvil de mensajería con chats, notas de voz, libreta personal y contactos. Registro por celular y correo.",
      },
      { property: "og:title", content: "Vozz — Mensajes y notas de voz" },
      {
        property: "og:description",
        content: "Chats, notas de voz y tu libreta personal, en una sola app móvil.",
      },
    ],
  }),
  component: OnboardingFlow,
});

function OnboardingFlow() {
  const { onboardingStep, setOnboardingStep, completeOnboarding } = useAppStore();

  switch (onboardingStep) {
    case "welcome":
      return <WelcomeStep onStart={() => setOnboardingStep("phone")} />;
    case "phone":
      // Piloto (2026-09-02, decisión del fundador): sin paso de código —
      // PhoneStep ya crea la sesión real con solo el número (ver la nota de
      // seguridad en src/lib/actions/auth.ts). Salta directo a "email".
      // Para reconectar el OTP real por SMS: restaurar el case "otp" (usaba
      // <OtpStep onVerified={() => setOnboardingStep("email")} />) y volver
      // este onSent a `() => setOnboardingStep("otp")`.
      return (
        <PhoneStep
          onBack={() => setOnboardingStep("welcome")}
          onSent={() => setOnboardingStep("email")}
        />
      );
    case "email":
      // "otp" ya no es un paso alcanzable (ver el case "phone" arriba) — si el
      // usuario da "atrás" aquí, debe volver a "phone", no a un paso fantasma.
      return (
        <EmailStep
          onBack={() => setOnboardingStep("phone")}
          onSent={() => setOnboardingStep("email_verify")}
        />
      );
    case "email_verify":
      return (
        <EmailVerifyStep
          onBack={() => setOnboardingStep("email")}
          onVerified={() => setOnboardingStep("profile")}
        />
      );
    case "profile":
      return (
        <ProfileStep
          onBack={() => setOnboardingStep("email_verify")}
          onNext={() => setOnboardingStep("permissions")}
        />
      );
    case "permissions":
      return (
        <PermissionsStep
          onBack={() => setOnboardingStep("profile")}
          onFinish={async () => {
            // PermissionsStep muestra el error en pantalla si esto lanza
            // (ver su try/catch) — no lo silenciamos aquí.
            await completeOnboarding();
          }}
        />
      );
    default:
      return <MainShell />;
  }
}

/** Cascarón de la navegación principal con las pestañas ya construidas. */
function MainShell() {
  const [activeTab, setActiveTab] = useState<MainTabKey>("chats");
  const [openChatId, setOpenChatId] = useState<ChatId | null>(null);
  const chats = useChats();
  const contacts = useContacts();
  const tabBar = <TabBar activeTab={activeTab} onChange={setActiveTab} />;

  if (activeTab === "chats")
    return (
      <ChatsTab
        controller={chats}
        contacts={contacts.allContacts}
        tabBar={tabBar}
        openChatId={openChatId}
        onOpenChatIdChange={setOpenChatId}
      />
    );
  if (activeTab === "notes") return <RemindersTab tabBar={tabBar} />;
  if (activeTab === "contacts")
    return (
      <ContactsTab
        controller={contacts}
        tabBar={tabBar}
        onSendMessage={(contact) => {
          if (!contact.linkedUserId) return;
          // Abre el chat existente o lo crea de verdad en Supabase, y salta
          // a la pestaña Chats.
          void chats
            .startChatWithUser(contact.linkedUserId, contact.displayName, contact.avatarUrl)
            .then((chatId) => {
              if (!chatId) return;
              chats.openChat(chatId);
              setOpenChatId(chatId);
              setActiveTab("chats");
            });
        }}
      />
    );
  if (activeTab === "copiloto") return <CopilotoTab tabBar={tabBar} />;

  return <ProfileTab tabBar={tabBar} />;
}
