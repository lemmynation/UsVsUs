# 11 — Analytics and validation

Same pipeline as today (`track` / `trackClient`, whitelisted names, sanitized properties, `/admin/metrics`).
**Never in payloads:** drawings, typed text, card labels chosen by a player, media, URLs, nicknames.

## New events (Sprint in brackets)

| Event                                                             | Properties                                            |
| ----------------------------------------------------------------- | ----------------------------------------------------- |
| `chaos_match_started` [1]                                         | game, playerCount, vibe, contentVersion               |
| `chaos_step_started` [1]                                          | step, kind                                            |
| `contribution_submitted` [1]                                      | step, kind, medium (`drawing` / `text`), secondsTaken |
| `chaos_step_skipped_player` [1]                                   | step (a placeholder was used)                         |
| `chaos_reveal_completed` [1]                                      | chains                                                |
| `chaos_match_completed` [1]                                       | playerCount, durationSeconds                          |
| `rematch_started`, `reaction_sent` [1]                            | existing events, reused                               |
| `party_screen_pair_requested` / `_approved` / `_disconnected` [2] | —                                                     |
| `capsule_earned` / `capsule_opened` / `cosmetic_equipped` [4–5]   | item ids only                                         |
| `media_permission_denied` [6]                                     | kind                                                  |

## Dashboard additions

Match completion rate, **time to first action** (seconds from step open to first submit), **per-player idle
time** (step open → submit, median/p90), voluntary immediate rematch rate, text-vs-drawing share, TV pairing
success [2], reconnect recovery, prompt repetition rate (cards seen twice by the same room).

## Playtest protocol (the real validation)

Before calling Sprint 1 done: 2+ real playtests with 4–6 people (one in person, one with a laptop as a fake
TV), observed. Record: did people laugh at reveals, did anyone ask for "one more", where did they wait,
which mutation cards confused. Metrics support this; they don't replace it.
