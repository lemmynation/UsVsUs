"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/client-api";
import { cn } from "@/lib/utils";

const RATINGS = [
  { value: 4, emoji: "😍", label: "Loved it" },
  { value: 3, emoji: "🙂", label: "Liked it" },
  { value: 2, emoji: "😐", label: "It was okay" },
  { value: 1, emoji: "😕", label: "Not for us" },
] as const;
type Rating = (typeof RATINGS)[number]["value"];

const COMMENT_MAX = 500;
const noSubscribe = () => () => {};
const storageKey = (roomId: string) => `uvu_feedback_${roomId}`;

function alreadyDone(roomId: string): boolean {
  try {
    return window.localStorage.getItem(storageKey(roomId)) === "done";
  } catch {
    return false;
  }
}

/**
 * Beta feedback (design doc Phase 7): one tap rates the game and is saved right
 * away; a comment is optional. Remembered per room on this phone so it isn't
 * asked again after a refresh.
 */
export function FeedbackCard({ roomId }: { roomId: string }) {
  const [rating, setRating] = useState<Rating | null>(null);
  const [comment, setComment] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "done" | "error">("idle");
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  // Read after hydration: the server can't know what this phone already sent.
  const doneBefore = useSyncExternalStore(
    noSubscribe,
    () => alreadyDone(roomId),
    () => false,
  );

  async function send(nextRating: Rating, withComment: boolean) {
    // Tapping a rating saves quietly in the background; only "Send" shows progress.
    setState(withComment ? "saving" : "idle");
    try {
      // One request at a time, in tap order, so a slow rating save can't land after "Send".
      const request = queue.current
        .catch(() => undefined)
        .then(() =>
          apiFetch(`/api/rooms/${roomId}/feedback`, {
            method: "POST",
            body: { rating: nextRating, comment: withComment ? comment : null },
          }),
        );
      queue.current = request;
      await request;
      if (withComment) {
        setState("done");
        try {
          window.localStorage.setItem(storageKey(roomId), "done");
        } catch {
          // Private mode: it may be asked again after a refresh, which is fine.
        }
      } else {
        setState("idle");
      }
    } catch {
      setState("error");
    }
  }

  function pick(value: Rating) {
    setRating(value);
    void send(value, false);
  }

  if (state === "done" || doneBefore) {
    return (
      <p role="status" className="text-muted-foreground text-center text-base">
        Thanks for the feedback! 💜
      </p>
    );
  }

  return (
    <section aria-labelledby="feedback-heading" className="bg-card flex flex-col gap-3 rounded-3xl p-4">
      <h2 id="feedback-heading" className="font-heading text-lg font-bold">
        How was the game?
      </h2>
      <div role="group" aria-labelledby="feedback-heading" className="grid grid-cols-4 gap-2">
        {RATINGS.map((r) => (
          <button
            key={r.value}
            type="button"
            aria-pressed={rating === r.value}
            onClick={() => pick(r.value)}
            className={cn(
              "focus-visible:ring-ring/50 flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl border-2 text-xs font-medium transition-colors outline-none focus-visible:ring-3",
              rating === r.value ? "border-primary bg-primary/15" : "border-border hover:bg-muted",
            )}
          >
            <span aria-hidden className="text-2xl">
              {r.emoji}
            </span>
            {r.label}
          </button>
        ))}
      </div>

      {rating !== null && (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void send(rating, true);
          }}
        >
          <label htmlFor="feedback-comment" className="text-sm font-medium">
            Anything we should know? <span className="text-muted-foreground font-normal">(optional)</span>
          </label>
          <textarea
            id="feedback-comment"
            rows={3}
            maxLength={COMMENT_MAX}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="What made you laugh, what was confusing, what you'd add…"
            className="border-input focus-visible:border-ring focus-visible:ring-ring/50 min-h-24 w-full rounded-xl border bg-transparent px-4 py-3 text-base outline-none focus-visible:ring-3"
          />
          <Button type="submit" variant="secondary" disabled={state === "saving"}>
            {state === "saving" ? "Sending…" : comment.trim() ? "Send" : "Done"}
          </Button>
        </form>
      )}

      {state === "error" && (
        <p role="alert" className="text-destructive text-sm">
          Couldn&apos;t send that. Check your connection and try again.
        </p>
      )}
    </section>
  );
}
