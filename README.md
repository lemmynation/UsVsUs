# Us vs. Us

**How well do you really know your people?** A mobile-first party game for couples, best friends and
whole friend groups. The host creates a room, shares a link, and everyone plays from their phones — no
app, no sign-up.

The product spec is [`docs/design.docx`](docs/design.docx) (text export: [`docs/design.md`](docs/design.md)).

## Status

| Phase           | What                                                                     | State   |
| --------------- | ------------------------------------------------------------------------ | ------- |
| 0 — Foundation  | Next.js, Tailwind, shadcn/ui, lint/test tooling, env validation, CI      | ✅ Done |
| 1 — Rooms       | Create/join rooms, anonymous sessions, live lobby, invite, host controls | ✅ Done |
| 2 — Realtime    | Server-run game flow, private answers, reveal sync, presence, reconnect  | ✅ Done |
| 3 — Game engine | Mind Reader, Who's More Likely, scoring                                  | Next    |
| 4–7             | Wrapped, premium packs, analytics & QA, beta                             | —       |

## Run it locally

Requires Node 22+.

```bash
npm install
npm run dev
```

Open http://localhost:3000. With no Supabase settings the app uses **in-memory rooms** (they reset when the
server restarts), which is enough to try it out. Open the invite link in a second browser profile or an
incognito window to play as a second player.

## Connect Supabase

1. Create a free project at [supabase.com](https://supabase.com).
2. In the project's **SQL Editor**, run each file in `supabase/migrations/` in name order, then
   `supabase/seed.sql` and `supabase/seed-questions.sql`.
3. Copy `.env.example` to `.env.local` and fill in the Project URL, the publishable key (`sb_publishable_…`)
   and the secret key (`sb_secret_…`) from **Project Settings → API Keys**. `.env.local` is git-ignored —
   never commit it.
4. Restart `npm run dev`. Rooms now persist, and lobbies update instantly via Supabase Realtime
   (broadcast must be allowed for the publishable key — it is by default).

## Questions

The question bank is plain data in `content/questions/`. To add or change questions, edit the JSON, run
`npm run db:seed-sql`, and run the regenerated `supabase/seed-questions.sql` in Supabase. Removing a question
from the JSON deactivates it rather than deleting it. The game avoids repeats per group: each new game picks
questions nobody in the room has seen first, then the least- and longest-ago-seen.

## Scripts

| Command               | Does                                       |
| --------------------- | ------------------------------------------ |
| `npm run dev`         | Dev server                                 |
| `npm run check`       | Lint + typecheck + unit tests              |
| `npm run test:e2e`    | Playwright browser tests (in-memory rooms) |
| `npm run build`       | Production build                           |
| `npm run format`      | Prettier                                   |
| `npm run db:seed-sql` | Regenerate the question seed SQL           |

## How it fits together

- `lib/rooms/rules.ts` — pure room rules (player limits, join codes, expiry, who can start/kick)
- `lib/rooms/service.ts` — room use-cases on top of a `RoomStore`
- `lib/rooms/supabase-store.ts` / `memory-store.ts` — storage; races are handled atomically in SQL
- `app/api/rooms/**` — route handlers; the server is the only thing that touches the database
- `hooks/use-room.ts` — keeps a lobby in sync (realtime ping → refetch, with polling fallback)
- `supabase/migrations/` — schema; RLS is enabled with no policies, so the public key can't read tables

See [`CLAUDE.md`](CLAUDE.md) for engineering rules.

## Known limits (beta)

- Rate limiting is in-process memory: fine for one server, not for multi-instance/serverless scale.
- Rooms expire lazily (they read as expired after 24 h); a scheduled cleanup job comes later.
- Kicked players are blocked per browser session; a new browser/incognito window can rejoin.
