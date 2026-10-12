"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, apiFetch } from "@/lib/client-api";
import { MODE_META } from "@/lib/modes";
import { NICKNAME_MAX, ROOM_NAME_MAX } from "@/lib/rooms/rules";
import { takeTypedValue } from "@/lib/typed-before-hydration";
import type { Experience, Mode } from "@/types/room";

export function CreateRoomForm({ mode, experience = "quick_party" }: { mode: Mode; experience?: Experience }) {
  const label =
    experience === "chain_reactions" ? (mode === "circle" ? "Circle Chaos" : "Duo Chaos") : MODE_META[mode].label;
  const router = useRouter();
  const [nickname, setNickname] = useState("");
  const [roomName, setRoomName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // Next keeps this page alive (hidden) after we navigate to the room. Clear the
  // "in progress" state when it hides, or coming back shows a stuck button.
  useEffect(() => () => setPending(false), []);
  // Keep anything typed before the page's code loaded (slow phones).
  useEffect(() => {
    takeTypedValue("nickname", setNickname);
    takeTypedValue("roomName", setRoomName);
  }, []);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const { roomId } = await apiFetch<{ roomId: string }>("/api/rooms", {
        method: "POST",
        body: { mode, nickname, roomName: roomName || null, experience },
      });
      router.push(`/room/${roomId}`);
    } catch (err) {
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
          placeholder="e.g. Lem"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "create-error" : undefined}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="roomName" className="text-base">
          Room name <span className="text-muted-foreground font-normal">(optional)</span>
        </Label>
        <Input
          id="roomName"
          name="roomName"
          autoComplete="off"
          maxLength={ROOM_NAME_MAX}
          placeholder={mode === "circle" ? "e.g. Friday barkada" : "e.g. Date night"}
          value={roomName}
          onChange={(e) => setRoomName(e.target.value)}
        />
      </div>
      {error && (
        <p id="create-error" role="alert" className="text-destructive text-base">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" disabled={pending || nickname.trim().length === 0}>
        {pending ? "Creating…" : `Create ${label} room`}
      </Button>
    </form>
  );
}
