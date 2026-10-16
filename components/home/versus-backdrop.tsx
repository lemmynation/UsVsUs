import { cn } from "@/lib/utils";

const DOODLES = [
  { glyph: "✦", className: "top-[5%] left-[3%] text-(--us-pink) text-3xl" },
  { glyph: "★", className: "top-[16%] right-[2%] text-(--us-yellow) text-2xl [animation-delay:-2s]" },
  { glyph: "✶", className: "top-[40%] left-[1%] text-(--us-blue) text-xl [animation-delay:-4s]" },
  { glyph: "●", className: "top-[55%] right-[1%] text-(--us-pink) text-sm [animation-delay:-1s]" },
  { glyph: "✦", className: "top-[72%] left-[2%] text-(--us-yellow) text-lg [animation-delay:-3s]" },
  { glyph: "★", className: "top-[88%] right-[3%] text-(--us-blue) text-2xl [animation-delay:-5s]" },
];

/** Decoration behind the home page: a pink side, a blue side, and a few bobbing doodles. */
export function VersusBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute -top-48 -left-48 size-[36rem] rounded-full bg-[radial-gradient(closest-side,var(--us-pink),transparent)] opacity-25" />
      <div className="absolute -right-48 -bottom-48 size-[36rem] rounded-full bg-[radial-gradient(closest-side,var(--us-blue),transparent)] opacity-25" />
      <svg className="absolute inset-0 size-full opacity-[0.07]" preserveAspectRatio="none" viewBox="0 0 100 100">
        <line x1="100" y1="0" x2="0" y2="100" stroke="var(--us-yellow)" strokeWidth="0.6" strokeDasharray="2 2" />
      </svg>
      {DOODLES.map((d, i) => (
        <span key={i} className={cn("doodle-bob absolute opacity-40", d.className)}>
          {d.glyph}
        </span>
      ))}
    </div>
  );
}
