"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, apiFetch } from "@/lib/client-api";
import { NICKNAME_MAX } from "@/lib/rooms/rules";

export function JoinRoomForm({ code }: { code: string }) {
  const router = useRouter();
  const [nickname, setNickname] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // Next keeps this page alive (hidden) after we navigate to the room. Clear the
  // "in progress" state when it hides, or coming back shows a stuck button.
  useEffect(() => () => setPending(false), []);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const { roomId } = await apiFetch<{ roomId: string }>("/api/rooms/join", {
        method: "POST",
        body: { code, nickname },
      });
      router.push(`/room/${roomId}`);
    } catch (err) {
      if (err instanceof ApiError && err.code !== "nickname_taken" && err.code !== "network") {
        // Room-level problem (full, expired, started) — reload to show the right screen.
        router.refresh();
      }
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
      <div className="flex flex-col gap-2">
        <Label htmlFor="nickname" className="text-base">
          Your nickname
        </Label>
        <Input
          id="nickname"
          name="nickname"
          autoComplete="nickname"
          autoFocus
          required
          maxLength={NICKNAME_MAX}
          placeholder="What should everyone call you?"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "join-error" : undefined}
        />
      </div>
      {error && (
        <p id="join-error" role="alert" className="text-destructive text-base">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" disabled={pending || nickname.trim().length === 0}>
        {pending ? "Joining…" : "Join room"}
      </Button>
    </form>
  );
}
