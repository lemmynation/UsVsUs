import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Full-screen friendly state for expired / full / missing rooms and similar dead ends. */
export function StatusCard({
  emoji,
  title,
  message,
  action = { href: "/", label: "Start your own game" },
}: {
  emoji: string;
  title: string;
  message: string;
  action?: { href: string; label: string };
}) {
  return (
    <section role="status" className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
      <span aria-hidden className="text-6xl">
        {emoji}
      </span>
      <h1 className="font-heading text-3xl font-extrabold">{title}</h1>
      <p className="text-muted-foreground max-w-xs text-lg">{message}</p>
      <Link href={action.href} className={cn(buttonVariants({ size: "lg" }), "mt-2 w-full")}>
        {action.label}
      </Link>
    </section>
  );
}
