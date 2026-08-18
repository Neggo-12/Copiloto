import { MessageCircle, NotebookPen, User, Users } from "@/components/shared/icons";
import type { AppIcon } from "@/components/shared/icons";

export type MainTabKey = "chats" | "notes" | "contacts" | "profile";

export const MAIN_TABS: Array<{ key: MainTabKey; label: string; icon: AppIcon }> = [
  { key: "chats", label: "Chats", icon: MessageCircle },
  { key: "notes", label: "Notas", icon: NotebookPen },
  { key: "contacts", label: "Contactos", icon: Users },
  { key: "profile", label: "Perfil", icon: User },
];

/** Barra inferior de pestañas persistente (navegación principal). */
export function TabBar({
  activeTab,
  onChange,
}: {
  activeTab: MainTabKey;
  onChange: (tab: MainTabKey) => void;
}) {
  return (
    <nav className="safe-bottom shrink-0 border-t border-border bg-surface/90 backdrop-blur">
      <ul className="grid grid-cols-4">
        {MAIN_TABS.map(({ key, label, icon: Icon }) => {
          const isActive = key === activeTab;
          return (
            <li key={key}>
              <button
                type="button"
                onClick={() => onChange(key)}
                aria-current={isActive ? "page" : undefined}
                className={`press touch-target flex w-full flex-col items-center gap-1 py-2 text-[11px] font-medium ${
                  isActive ? "text-primary" : "text-muted-foreground"
                }`}
              >
                <Icon className="size-6" strokeWidth={isActive ? 2.4 : 1.8} />
                {label}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
