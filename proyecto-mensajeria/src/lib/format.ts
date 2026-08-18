/** Formateo de fechas, horas y tamaños para la UI. */

export function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-CO", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** Hora si es hoy, "Ayer", día de la semana o fecha corta. */
export function formatChatTimestamp(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const diffDays = Math.floor((startOfToday - date.getTime()) / 86_400_000);
  if (date.getTime() >= startOfToday) return formatClock(iso);
  if (diffDays < 1) return "Ayer";
  if (diffDays < 6) return date.toLocaleDateString("es-CO", { weekday: "short" });
  return date.toLocaleDateString("es-CO", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

export function formatFileSize(bytes?: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function initialsOf(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
