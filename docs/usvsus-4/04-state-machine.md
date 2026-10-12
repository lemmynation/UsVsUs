# 04 — Multiplayer state machine

Built the same way as Quick Party's game flow (`lib/game/state-machine.ts`): pure transition functions,
every move a **compare-and-swap on `state_version`**, the server the only authority.

## Room (unchanged)

The spec's room lifecycle maps onto existing statuses; no new values are needed:

| Spec                    | Existing `rooms.status`                                           |
| ----------------------- | ----------------------------------------------------------------- |
| created → lobby → ready | `LOBBY` ("ready" = enough players, shown in the UI, not a status) |
| playing → reveal        | `IN_GAME`                                                         |
| recap                   | `WRAPPED`                                                         |
| rematch                 | `WRAPPED → LOBBY` via the existing atomic `reopen_room`           |
| closed                  | `COMPLETED` / `EXPIRED` / `ABANDONED`                             |

A room gains `experience`: `quick_party` (default, every existing room) or `chain_reactions`.

## Chain match (new)

```
         start (host, ≥ 2 players)
LOBBY ─────────────────────────────▶ STEP_OPEN(step 1)
                                        │  all submitted / deadline + host "next" / host skip
                                        ▼
                                     STEP_LOCKED(step k) ── score step (idempotent) ──▶ STEP_OPEN(step k+1)
                                        │ last step
                                        ▼
                                     REVEAL(chain c) ── host next / auto-advance ──▶ REVEAL(chain c+1)
                                        │ last chain
                                        ▼
                                     RECAP ── host Rematch ──▶ room LOBBY (new match on next start)
```

- Steps come from the frozen plan (create, mutate, detect, mutate, detect for Circle; Duo has its own list).
- `STEP_LOCKED` is short-lived: the server writes it, scores the step once, then moves on. A crash between
  the two is repaired by the next request (same pattern as Quick Party's `lockInScores`).
- **No scoring after lock**: submissions are accepted only while the match is `STEP_OPEN` _for that step_,
  checked under a row lock (as `submit_response` does today).

## Contribution lifecycle

`requested` (assignment exists) → `draft` (phone only, never sent) → `submitted` → `validated` →
**immutable**. A player may _replace_ their own submission until the step locks (same idempotency key,
newer version wins). After lock: refused (`step_closed`).

## Required properties → how they're met

| Requirement               | Mechanism                                                                                                       |
| ------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Authoritative transitions | Only route handlers move state, through SQL functions                                                           |
| Optimistic concurrency    | `state_version` compare-and-swap; stale = refetch quietly                                                       |
| Idempotent submissions    | Unique `(match_id, step, player_id, chain_id)`; client sends an idempotency key, a retry returns the stored row |
| Idempotent scores         | Unique per `(match_id, step, player_id, chain_id, reason)`; recompute is a no-op                                |
| Per-player secrets        | Assignment checked server-side on every submit; projections built per viewer                                    |
| Reconnect                 | `GET` returns a full snapshot for that viewer; realtime is only a "something changed" ping                      |
| Host reassignment         | Existing host handover; the new host gets the host controls                                                     |
| Inactive player           | Deadline passes → host sees "skip waiting"; missing work becomes a placeholder                                  |
| No silent auto-submit     | Drafts never leave the phone; deadline ⇒ placeholder, not the draft                                             |
| Spectators never players  | Spectator sessions live in their own table and never appear in `players`                                        |

## Race cases to test (unit + E2E)

1. Two submits from one player (double tap / retry) → one stored row.
2. Submit racing the lock → either accepted before lock, or `step_closed`; never scored after lock.
3. Two "next" taps / two hosts → one transition (`stale` for the second).
4. Player leaves mid-step → their chains continue with placeholders; assignments for later steps are not
   recomputed (frozen at start), so nobody silently gets an extra job.
5. Host leaves mid-match → next player becomes host and can advance.
6. 3, 4, 6 and 10-player matches complete with every assignment valid (property test over many seeds).
