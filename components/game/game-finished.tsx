import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** End of game. The full Wrapped report and share card arrive in Phase 4. */
export function GameFinished() {
  return (
    <section className="animate-in fade-in zoom-in-95 flex flex-1 flex-col items-center justify-center gap-4 text-center duration-500">
      <span aria-hidden className="text-7xl">
        🎬
      </span>
      <h1 className="font-heading text-mode-gradient text-5xl font-extrabold">That&apos;s a wrap!</h1>
      <p className="text-muted-foreground max-w-xs text-lg">Thanks for playing. Up for another round of questions?</p>
      <Link href="/" className={cn(buttonVariants({ size: "lg" }), "mt-2 w-full")}>
        Play again
      </Link>
    </section>
  );
}
