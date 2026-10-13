# 07 — Projections and Party Screen security

## Rule: the server builds a separate view per viewer

Hiding fields in React is not protection. Each request gets a **projection** built by a pure, unit-tested
function in `lib/chaos/projections.ts`:

```ts
playerView(match, players, contributions, me): ChaosPlayerView     // GET /api/rooms/:id (players)
spectatorView(match, players, contributions): ChaosSpectatorView   // GET /api/party/:displayId (TV)
```

| Data                                                         | Player (own)      | Player (others') | Spectator (TV)         |
| ------------------------------------------------------------ | ----------------- | ---------------- | ---------------------- |
| Room name, avatars, nicknames, ready counts                  | ✓                 | ✓                | ✓                      |
| Current step, public instructions, timer                     | ✓                 | ✓                | ✓                      |
| My assignment (which chain, which role)                      | ✓                 | ✗                | ✗                      |
| Seed object / mutation card I was given                      | ✓                 | ✗                | ✗ (only in the reveal) |
| Artifact I must work on (assigned chain only)                | ✓                 | ✗                | ✗                      |
| Detect choices for my assigned chains                        | ✓                 | ✗                | ✗                      |
| Who has submitted (counts / ticks, no content)               | ✓                 | ✓                | ✓ (counts only)        |
| Other players' drafts, answers, picks                        | ✗                 | ✗                | ✗                      |
| Correct answers                                              | ✗ until reveal    | ✗ until reveal   | ✗ until reveal         |
| Revealed lineage (artifacts, cards, answers, points)         | ✓ in REVEAL/RECAP | ✓                | ✓                      |
| Reaction aggregates                                          | ✓                 | ✓                | ✓                      |
| Session ids, token hashes, internal ids beyond what's needed | ✗                 | ✗                | ✗                      |

**Leak tests** (negative tests, required for the Sprint 1 gate): for every step of a seeded 6-player match,
serialize each projection to JSON and assert it contains none of the forbidden values (unrevealed card ids
and labels, other players' answers, other chains' artifacts). The same check runs against the real HTTP
responses in E2E, including the spectator endpoint in Sprint 2.

Realtime stays a payload-free ping; drawings and media are never sent over realtime.

## Party Screen pairing protocol (Sprint 2)

```
TV (laptop/TV browser)                Server                          Host phone
 1. POST /api/party ─────────────────▶ create pending display
                                       code = 6 chars (no 0/O/1/I), 5-min expiry,
                                       store sha256(code); set httpOnly
                                       spectator cookie (random token, hash stored)
    shows big code + "waiting"  ◀────
 2.                                                          Lobby → "Connect a TV" → types code
                                       POST /api/rooms/:id/displays {code}  ◀────────────────
                                       host only, rate-limited (5/10 min/room + per IP),
                                       single use, not expired → status approved, room set
 3. TV polls GET /api/party/me ──────▶ approved → spectatorView(room)
    shows lobby + QR (/join/CODE)
```

- **Why the code is on the TV:** typing on a TV remote is painful; phones type easily. The TV never needs
  input except an optional fullscreen button.
- **Scoped, revocable:** the spectator cookie only reads `spectatorView` for one room. The host can see
  connected displays, revoke one, or connect a replacement. Revoked ⇒ the TV returns to the pairing screen.
- **QR on the TV is the normal join link** (`/join/CODE`), never the spectator token.
- **TV disconnect never affects play:** the TV is a reader; nothing waits for it.

## Threat model (summary)

| Threat                                        | Mitigation                                                                                                              |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Someone guesses a pairing code                | 6 chars × 31 symbols ≈ 887 M combos, 5-min expiry, single use, host must approve, rate limits per room and IP           |
| A player opens the spectator page to cheat    | Spectator view only ever contains public data; nothing to gain                                                          |
| A player inspects network traffic for answers | Per-viewer projections; leak tests on real responses                                                                    |
| Stolen spectator cookie                       | Scoped to one room, read-only, revocable, expires with the room                                                         |
| Replay of a submission                        | Idempotency key + unique constraint; step lock                                                                          |
| Submitting for someone else's chain           | Server checks the frozen assignment for (player, step, chain)                                                           |
| Oversized or malicious drawing data           | zod schema: numbers only, ≤ 64 KB, ≤ 300 strokes, ≤ 8,000 points; rendered as SVG paths we build (no markup from users) |
| Abuse in text fallback                        | Length limits, control characters stripped (existing `cleanText`), report/leave controls; no public feed                |
