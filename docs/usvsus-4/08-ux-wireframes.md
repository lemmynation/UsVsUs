# 08 — UX wireframes (phone controller, TV stage)

Phone: portrait, one hand, 44 px+ targets, existing visual language. TV: 16:9, 1080p type, 5% overscan
margins, nothing to tap. Reduced motion respected everywhere (existing `useReducedMotion` + global CSS rule).

## Phone (player)

```
 ┌──────────────────────┐   ┌──────────────────────┐   ┌──────────────────────┐
 │ Us vs. Us   ⚡ Chaos  │   │ Step 1 of 5 · 0:42   │   │ Step 2 · 0:31        │
 │ Mutation Machine     │   │ Draw this:           │   │ Mutate this machine: │
 │ "Draw a thing. Some- │   │  🧸 TEDDY BEAR        │   │ ┌──────────────────┐ │
 │  one secretly mutates│   │ ┌──────────────────┐ │   │ │  (their drawing) │ │
 │  it. Work out what   │   │ │                  │ │   │ │                  │ │
 │  happened."          │   │ │   canvas         │ │   │ └──────────────────┘ │
 │ Players 5/10         │   │ │                  │ │   │ 🔒 Secret: MAKE IT   │
 │  ● Lem 👑 ● Ana …    │   │ └──────────────────┘ │   │    ANGRY 😠          │
 │ [Connect a TV 📺]    │   │ ✏️ ⬛🟥🟦 ↶ Undo  🗑  │   │ (can't erase theirs) │
 │ [ Start ]  (host)    │   │ [Describe instead]   │   │ [ Submit ] [Swap 1×] │
 └──────────────────────┘   │ [ Submit ]           │   └──────────────────────┘
                            └──────────────────────┘
 ┌──────────────────────┐   ┌──────────────────────┐   ┌──────────────────────┐
 │ Step 3 · Detect 1/3  │   │ Waiting… 4 of 6 in   │   │ 🏁 Recap             │
 │ ┌──────────────────┐ │   │  ✓ Ana ✓ Ben ⏳ Cy   │   │ You: Sharp Eye 🔎    │
 │ │ (finished thing) │ │   │ (host) [All in? Next]│   │ Chain of the night:  │
 │ └──────────────────┘ │   │ (host) [Skip waiting]│   │ 🦆→😠🦆→😠🦆🛞        │
 │ What was it before?  │   └──────────────────────┘   │ 😂 🔥 😳 💀 😍 👏      │
 │ (◉)Duck ( )Kettle …  │                              │ [🔁 Rematch] (host)  │
 │ What happened to it? │                              └──────────────────────┘
 │ ( )Tiny (◉)Angry …   │
 │ [ Lock in ]          │
 └──────────────────────┘
```

Canvas: Pointer Events, 1 finger draws, pinch disabled, 4 colours + 2 widths, undo, clear (own strokes only),
600×600 logical units scaled to the screen. Mutators draw on a layer above the original and cannot erase it.

## TV (spectator)

```
 ┌───────────────────────────────────────────────────────────────────────────────┐
 │  US VS. US · MUTATION MACHINE                                   Room  K7P2QX  │
 │                                                                               │
 │   ┌───────────┐   Scan to join         Lem 👑   Ana    Ben    Cy    Dee      │
 │   │  ▓▓ QR ▓▓ │   or go to             ●        ●      ●      ○     ●        │
 │   │  ▓▓▓▓▓▓▓  │   us-vs-us-chi.vercel.app/join  ·  code K7P2QX                │
 │   └───────────┘                                                               │
 │                      Waiting for Lem to start…                                │
 └───────────────────────────────────────────────────────────────────────────────┘
   During a step:  big timer · "Draw your thing!" · 4 of 6 submitted · no artwork shown
   Reveal (per chain, ~12 s, host can skip):
   ┌──────────┐  ──▶  ┌──────────┐  ──▶  ┌──────────┐     "Rubber duck → MAKE IT ANGRY → ON WHEELS"
   │ original │       │ +angry   │       │ +wheels  │     2 of 3 spotted it 🔎   😂×7 🔥×3
   └──────────┘       └──────────┘       └──────────┘
```

Pairing screen: the 6-character code in 200 px type, "On your phone: Lobby → Connect a TV", expiry
countdown, fullscreen button. Disconnected: "Reconnecting…" overlay; the game continues on phones.

## Quick Party

Unchanged. The landing page gains one entry: **Chain Reactions (new)** next to the existing modes.
