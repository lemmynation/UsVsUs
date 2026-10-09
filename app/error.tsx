"use client";

import Link from "next/link";
import { useEffect } from "react";
import { PageShell } from "@/components/layout/page-shell";
import { Button, buttonVariants } from "@/components/ui/button";
import { reportClientError } from "@/lib/client-errors";
import { cn } from "@/lib/utils";

/** A screen crashed: say so plainly, offer a retry, and report it. */
export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => reportClientError("boundary", error, error.digest), [error]);
  return (
    <PageShell>
      <section role="alert" className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <span aria-hidden className="text-6xl">
          😵
        </span>
        <h1 className="font-heading text-3xl font-extrabold">Something went wrong</h1>
        <p className="text-muted-foreground max-w-xs text-lg">
          Your game is safe — the server keeps it. Try again, or head back home.
        </p>
        <Button size="lg" className="mt-2 w-full" onClick={() => retry()}>
          Try again
        </Button>
        <Link href="/" className={cn(buttonVariants({ size: "lg", variant: "ghost" }), "w-full")}>
          Back to home
        </Link>
      </section>
    </PageShell>
  );
}
