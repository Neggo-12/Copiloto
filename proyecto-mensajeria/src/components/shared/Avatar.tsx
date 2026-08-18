import { cn } from "@/lib/utils";
import { initialsOf } from "@/lib/format";

/** Avatar circular con iniciales cuando no hay foto. */
export function Avatar({
  name,
  avatarUrl,
  size = "md",
  className,
}: {
  name: string;
  avatarUrl?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const sizes = {
    sm: "size-9 text-[12px]",
    md: "size-12 text-[15px]",
    lg: "size-14 text-[17px]",
  } as const;

  return (
    <div
      className={cn(
        "grid shrink-0 place-items-center overflow-hidden rounded-full border border-border bg-accent font-semibold text-accent-foreground",
        sizes[size],
        className,
      )}
      aria-hidden
    >
      {avatarUrl ? (
        <img src={avatarUrl} alt="" className="size-full object-cover" />
      ) : (
        initialsOf(name)
      )}
    </div>
  );
}
