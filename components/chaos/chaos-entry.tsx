import Link from "next/link";

const ENTRIES = [
  {
    href: "/create?mode=friends&game=chaos",
    title: "Duo Chaos",
    players: "2 players",
    blurb: "Mutate each other's drawings. Co-op.",
  },
  {
    href: "/create?mode=circle&game=chaos",
    title: "Circle Chaos",
    players: "3–10 players",
    blurb: "Everyone draws, mutates and detects at once.",
  },
];

/** Landing-page entry for Chain Reactions (only rendered when its feature flag is on). */
export function ChaosEntry() {
  return (
    <section aria-labelledby="chaos-heading" className="flex flex-col gap-3">
      <h2 id="chaos-heading" className="text-lg font-semibold">
        ⚡ New: Mutation Machine
      </h2>
      <p className="text-muted-foreground text-base">
        Draw a thing. Someone secretly mutates it. Everyone else works out what it was and what happened to it.
      </p>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {ENTRIES.map((e) => (
          <li key={e.href}>
            <Link
              href={e.href}
              className="border-mode-gradient focus-visible:ring-ring/50 flex min-h-11 flex-col gap-1 rounded-3xl p-4 outline-none focus-visible:ring-3"
            >
              <span className="text-lg font-bold">
                {e.title} <span className="text-muted-foreground text-sm font-normal">{e.players}</span>
              </span>
              <span className="text-muted-foreground text-base">{e.blurb}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
