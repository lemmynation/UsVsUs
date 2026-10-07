import { cn } from "@/lib/utils";

/** Mobile-first column: one-handed portrait use, centred on larger screens. */
export function PageShell({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <main className={cn("mx-auto flex min-h-dvh w-full max-w-md flex-col gap-6 px-5 pt-8 pb-10", className)}>
      {children}
    </main>
  );
}
