import Link from "next/link";
import { cn } from "@/lib/utils";

export function Wordmark({ size = "md", className }: { size?: "md" | "lg"; className?: string }) {
  return (
    <Link
      href="/"
      className={cn(
        "font-heading focus-visible:ring-ring/50 inline-block rounded-md font-extrabold tracking-tight focus-visible:ring-3 focus-visible:outline-none",
        size === "lg" ? "text-5xl" : "text-2xl",
        className,
      )}
    >
      Us <span className="text-mode-gradient">vs.</span> Us
    </Link>
  );
}
