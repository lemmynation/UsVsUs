import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * "Us vs. Us" as two sides facing off: a pink Us, a yellow VS badge, a blue Us.
 * The large one (home page) slides in and slams the badge down; the global
 * reduced-motion rule leaves it still.
 */
export function Wordmark({ size = "md", className }: { size?: "md" | "lg"; className?: string }) {
  const lg = size === "lg";
  return (
    <Link
      href="/"
      aria-label="Us vs. Us"
      className={cn(
        "font-heading focus-visible:ring-ring/50 inline-flex items-center rounded-md font-extrabold tracking-tight focus-visible:ring-3 focus-visible:outline-none",
        lg ? "gap-2 text-6xl" : "gap-1 text-2xl",
        className,
      )}
    >
      <span aria-hidden className={cn("inline-block text-(--us-pink)", lg && "us-in-left -rotate-6")}>
        Us
      </span>
      <span
        aria-hidden
        className={cn(
          "inline-grid place-items-center rounded-full bg-(--us-yellow) leading-none text-(--us-ink)",
          lg ? "vs-slam size-16 rotate-0 text-2xl shadow-[0_4px_0_0_var(--us-ink)] ring-4 ring-(--us-ink)" : "size-8 text-sm",
        )}
      >
        vs
      </span>
      <span aria-hidden className={cn("inline-block text-(--us-blue)", lg && "us-in-right rotate-6")}>
        Us
      </span>
    </Link>
  );
}
