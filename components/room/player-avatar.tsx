import { cn } from "@/lib/utils";

function initials(nickname: string): string {
  const parts = nickname.trim().split(/\s+/);
  const letters = parts.length > 1 ? [parts[0], parts[parts.length - 1]] : [nickname];
  return letters
    .map((p) => [...p][0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/** Stable hue per nickname so each player keeps "their" colour. */
function hue(nickname: string): number {
  let h = 0;
  for (const ch of nickname) h = (h * 31 + ch.codePointAt(0)!) % 360;
  return h;
}

export function PlayerAvatar({ nickname, className }: { nickname: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-12 shrink-0 place-items-center rounded-full text-lg font-bold text-[oklch(0.18_0.04_300)]",
        className,
      )}
      style={{ backgroundColor: `oklch(0.82 0.12 ${hue(nickname)})` }}
    >
      {initials(nickname)}
    </span>
  );
}
