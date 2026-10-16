"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errorMessage } from "@/lib/rooms/errors";
import { JOIN_CODE_LENGTH, normalizeJoinCode } from "@/lib/rooms/rules";
import { takeTypedValue } from "@/lib/typed-before-hydration";
import { cn } from "@/lib/utils";

/** `compact`: one row under the home page hero, no autofocus (it would pop the keyboard on load). */
export function JoinCodeForm({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Keep anything typed before the page's code loaded (slow phones).
  useEffect(() => takeTypedValue("code", setCode), []);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = normalizeJoinCode(code);
    if (!normalized) {
      setError(errorMessage("invalid_code"));
      return;
    }
    router.push(`/join/${normalized}`);
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2" noValidate>
      <Label htmlFor="code" className={cn("text-base", compact && "sr-only")}>
        Room code
      </Label>
      <div className={cn("flex gap-2", !compact && "flex-col gap-5")}>
        <Input
          id="code"
          name="code"
          autoFocus={!compact}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={JOIN_CODE_LENGTH + 2}
          placeholder="ABC234"
          className={cn(
            "text-center font-mono uppercase",
            compact ? "h-14 min-w-0 flex-1 text-xl tracking-[0.25em]" : "h-16 text-3xl tracking-[0.3em]",
          )}
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            setError(null);
          }}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "code-error" : undefined}
        />
        <Button
          type="submit"
          size="lg"
          disabled={code.trim().length === 0}
          className={cn(compact && "press-3d [--press-shadow:var(--us-blue-deep)] bg-(--us-blue) text-(--us-ink) hover:bg-(--us-blue)/90")}
        >
          {compact ? "Join" : "Find room"}
        </Button>
      </div>
      {error && (
        <p id="code-error" role="alert" className="text-destructive text-base">
          {error}
        </p>
      )}
    </form>
  );
}
