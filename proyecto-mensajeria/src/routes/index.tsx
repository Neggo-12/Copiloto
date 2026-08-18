import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { WelcomeStep } from "@/components/onboarding/WelcomeStep";
import { PhoneStep } from "@/components/onboarding/PhoneStep";
import { OtpStep } from "@/components/onboarding/OtpStep";
import { EmailStep, EmailVerifyStep } from "@/components/onboarding/EmailStep";
import { ProfileStep } from "@/components/onboarding/ProfileStep";
import { PermissionsStep } from "@/components/onboarding/PermissionsStep";
import { ChatsTab } from "@/components/chats/ChatsTab";
import { NotesTab } from "@/components/notes/NotesTab";
import { ContactsTab } from "@/components/contacts/ContactsTab";
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
      return (
        <PhoneStep
          onBack={() => setOnboardingStep("welcome")}
          onSent={() => setOnboardingStep("otp")}
        />
      );
    case "otp":
      return (
        <OtpStep
          onBack={() => setOnboardingStep("phone")}
          onVerified={() => setOnboardingStep("email")}
        />
      );
    case "email":
      return (
        <EmailStep
          onBack={() => setOnboardingStep("otp")}
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
          onFinish={() => completeOnboarding()}
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
  if (activeTab === "notes") return <NotesTab tabBar={tabBar} />;
  if (activeTab === "contacts")
    return (
      <ContactsTab
        controller={contacts}
        tabBar={tabBar}
        onSendMessage={(contact) => {
          if (!contact.linkedUserId) return;
          // Abre el chat existente o lo crea, y salta a la pestaña Chats.
          const chatId = chats.startChatWithUser(contact.linkedUserId, contact.displayName);
          chats.openChat(chatId);
          setOpenChatId(chatId);
          setActiveTab("chats");
        }}
      />
    );

  return <ProfileTab tabBar={tabBar} />;
}
