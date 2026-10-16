import { HOME_DEMO } from "@/lib/games";
import { cn } from "@/lib/utils";

function Bubble({ who, side, children }: { who: string; side: "pink" | "blue"; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "relative flex min-h-28 flex-1 flex-col gap-1 rounded-2xl border-2 border-(--us-ink) p-3 text-(--us-ink) shadow-[4px_4px_0_0_var(--us-ink)]",
        side === "pink" ? "-rotate-3 bg-(--us-pink)" : "rotate-3 bg-(--us-blue)",
      )}
    >
      <span className="text-xs font-bold tracking-wide uppercase">{who}</span>
      {children}
    </div>
  );
}

function Stamp({ hit, points }: { hit: boolean; points: number }) {
  return (
    <span
      className={cn(
        "demo-stamp absolute -right-2 -bottom-3 rounded-lg border-2 border-(--us-ink) px-2 py-0.5 text-sm font-extrabold text-(--us-ink)",
        hit ? "bg-(--us-yellow)" : "bg-white",
      )}
    >
      {hit ? "✓" : "✗"} +{points}
    </span>
  );
}

/**
 * The game in three seconds: someone answers about themselves, a friend guesses.
 * Loops a miss and then a match; it's decoration, the copy around it says the same.
 */
export function HeroDemo() {
  const d = HOME_DEMO;
  return (
    <div aria-hidden className="flex w-full flex-col items-center gap-3">
      <p className="rounded-full bg-white/10 px-4 py-1.5 text-sm font-semibold">“{d.question}”</p>
      <div className="flex w-full items-stretch gap-3 px-1">
        <Bubble who={`${d.subject} answered`} side="pink">
          <span className="text-sm font-bold min-[380px]:text-base">{d.answer}</span>
          <span className="text-xs font-semibold">🤫 secret till reveal</span>
        </Bubble>
        <Bubble who={`${d.guesser} guessed`} side="blue">
          <div className="grid">
            <div className="demo-miss col-start-1 row-start-1">
              <span className="text-sm font-bold min-[380px]:text-base">{d.miss}</span>
              <Stamp hit={false} points={d.missPoints} />
            </div>
            <div className="demo-match col-start-1 row-start-1">
              <span className="text-sm font-bold min-[380px]:text-base">{d.answer}</span>
              <Stamp hit points={d.matchPoints} />
            </div>
          </div>
        </Bubble>
      </div>
    </div>
  );
}
