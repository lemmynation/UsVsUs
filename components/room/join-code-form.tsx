"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errorMessage } from "@/lib/rooms/errors";
import { JOIN_CODE_LENGTH, normalizeJoinCode } from "@/lib/rooms/rules";

export function JoinCodeForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

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
    <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
      <div className="flex flex-col gap-2">
        <Label htmlFor="code" className="text-base">
          Room code
        </Label>
        <Input
          id="code"
          name="code"
          autoFocus
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={JOIN_CODE_LENGTH + 2}
          placeholder="ABC234"
          className="h-16 text-center font-mono text-3xl tracking-[0.3em] uppercase"
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            setError(null);
          }}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "code-error" : undefined}
        />
      </div>
      {error && (
        <p id="code-error" role="alert" className="text-destructive text-base">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" disabled={code.trim().length === 0}>
        Find room
      </Button>
    </form>
  );
}
