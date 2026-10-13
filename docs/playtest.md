# Real-group playtest (validation sprint, step 4)

Goal: find out whether real couples and barkadas **finish** a match, **understand the reveals**, and **want
to play again without being asked**. Do this before accounts, cosmetics or payments.

## Five sessions

| #   | Group               | Game                                 | Phones               |
| --- | ------------------- | ------------------------------------ | -------------------- |
| 1   | A couple            | Mind Match · Couple                  | 2 (iPhone + Android) |
| 2   | Two friends         | Mind Match · Friends, then Duo Chaos | 2                    |
| 3   | Barkada of 4–6      | Mind Match · Circle                  | 4–6, mixed           |
| 4   | Barkada of 4–6      | Mutation Machine · Circle Chaos      | 4–6, mixed           |
| 5   | Bigger group (7–10) | Their choice from the home page      | 7–10                 |

Use https://us-vs-us-chi.vercel.app. One person hosts from the home page; everyone else joins by the shared
link. Don't explain the game first: the home page, invite page and lobby are supposed to do that.

## What to watch (write it down, don't help unless they're stuck for a minute)

- **Getting in:** Did anyone get lost between the link and the lobby? Did they read "How to play"?
- **First round:** Did anyone ask "what do I do?" Which screen?
- **Reveals:** Did they react out loud? Did anyone not understand who got points or why?
- **Mutation Machine only:** Could they spot the mutations, or was it random guessing? Did drawing feel OK on
  their phone (scrolling instead of drawing, lag)? Ask: "What game does this remind you of?"
- **Waiting:** Did anyone sit idle for more than ~30 seconds? On which step?
- **The end:** Did they tap **Rematch** on their own? How many matches did they play? Did they share the
  Wrapped image?

## After each session

- Ask: "Would you play this again next week? With who?" and "What was the best moment? The most confusing?"
- Check `/admin/metrics` (needs `ADMIN_TOKEN`): matches started vs. finished, rematches, feedback ratings.
- Note anything broken with the phone model and browser.

## Decision

Two or more groups rematch without being prompted, and nobody gets stuck: keep building on it. Otherwise
fix the confusing screens first. Mutation Machine stays only if groups say it's fun _and_ detection isn't
random guessing.
