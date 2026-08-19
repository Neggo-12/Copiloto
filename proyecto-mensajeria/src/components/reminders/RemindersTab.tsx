import { useState } from "react";
import type { ReactNode } from "react";
import { RemindersListScreen } from "@/components/reminders/RemindersListScreen";
import { RemindersEditorScreen } from "@/components/reminders/RemindersEditorScreen";
import { useReminders } from "@/hooks/useReminders";

/** Pestaña "Notas": libreta unificada de notas, tareas y recordatorios de lugar (ADR-0023). */
export function RemindersTab({ tabBar }: { tabBar: ReactNode }) {
  const controller = useReminders();
  const [openId, setOpenId] = useState<string | null>(null);

  if (openId) {
    return (
      <RemindersEditorScreen
        controller={controller}
        reminderId={openId}
        onBack={() => {
          // Autoguardado: al salir se descarta la nota si quedó vacía (sin
          // título, sin cuerpo y sin marcar como tarea) — mismo criterio
          // que tenía la libreta local antes de conectarse al backend real.
          const item = [...controller.reminders, ...controller.archivedReminders].find(
            (r) => r.id === openId,
          );
          if (
            item &&
            item.kind === "note" &&
            !item.title?.trim() &&
            !item.message.trim() &&
            !item.isTask
          ) {
            void controller.removeNote(item.id);
          }
          setOpenId(null);
        }}
      />
    );
  }

  return <RemindersListScreen controller={controller} tabBar={tabBar} onOpenReminder={setOpenId} />;
}
