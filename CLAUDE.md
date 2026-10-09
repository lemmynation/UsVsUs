@AGENTS.md

# Us vs. Us — Engineering Rules

Build a mobile-first social game web app. Follow the product/design document as the source of truth:
`docs/design.docx` (a text export lives in `docs/design.md`).

## Priorities

1. Correct realtime game state.
2. Fast mobile UX.
3. Simple maintainable architecture.
4. Tests for scoring/state/payment logic.
5. Do not add features outside the current phase.

## Engineering constraints

- TypeScript strict mode.
- Keep domain/game logic separate from React UI.
- Server is authoritative for scoring, reveals, entitlements, and game transitions.
- Never trust client payment status or score values.
- Questions are data-driven; do not hardcode question text into components.
- No mandatory user account in MVP.
- Prefer small reusable components over giant page components.
- Validate all external/input data.
- Every database schema change must be a migration.
- Add tests with every scoring/state-machine change.
- Preserve accessibility and reduced-motion behavior.

## Workflow

Before implementing a phase:

1. Inspect relevant existing files.
2. Propose a concise implementation plan.
3. Implement only that phase.
4. Run typecheck, lint, unit tests, and relevant E2E tests.
5. Summarize changed files, tests, assumptions, and remaining issues.

Do not silently refactor unrelated code.
Do not introduce a new dependency unless it materially simplifies the implementation.

## How this codebase works

- **Next.js 16** with `cacheComponents` on. Read `node_modules/next/dist/docs/` before using an API you
  haven't checked. Pages that read cookies, params or the clock render that part inside `<Suspense>` and
  call `await connection()` first (see `app/room/[roomId]/page.tsx`).
- **Domain logic** lives in `lib/rooms/rules.ts` (pure functions) and `lib/rooms/service.ts` (orchestration,
  dependencies injected). No Next.js or Supabase imports there — that is what keeps it unit-testable.
- **Storage** goes through the `RoomStore` interface (`lib/rooms/store.ts`). `SupabaseRoomStore` is real;
  `MemoryRoomStore` is for local dev without Supabase and for tests. Invariants that can race (capacity,
  start, host handover) are enforced atomically in the store — in SQL functions for Supabase. Keep both
  stores behaving the same; when you change one, change the other and the migration.
- **Game flow** (`lib/game/`): `state-machine.ts` is the pure §12 flow (ROUND_INTRO → QUESTION_OPEN → REVEAL
  → … → SCOREBOARD → FINISHED); `service.ts` runs it. Every transition is a compare-and-swap on
  `state_version` (stale = someone already moved it; clients just refetch). Answers are written with
  `submit_response`, which holds a row lock so nothing lands after a reveal. Other players' answers only
  appear in the view during REVEAL — never put them anywhere else.
- **Questions** live in `content/questions/*.json` (validated by `lib/game/questions.ts`). After editing,
  run `npm run db:seed-sql` and apply `supabase/seed-questions.sql`; a unit test fails if it's stale.
  Never delete a question — removing it from content deactivates it, so running games and history survive.
  `question-picker.ts` avoids repeats per group via `question_history` (keyed by session hash).
- **Game types** (`lib/game/engines.ts`, `scoring.ts`): round lineup per mode, Mind Reader subjects,
  answer validation, and the §7 points table — all pure and unit-tested. Points are locked in at each
  reveal via the idempotent `recordScores` (unique per player per question), after the reveal is saved
  so no late answer can be missed; never compute totals from raw answers. Circle's Who's More Likely is
  anonymous: the view only ever exposes vote counts, never who voted for whom.
- **Wrapped** (`lib/game/wrapped.ts`): built once when the game finishes and frozen in `wrapped_reports`
  (first save wins), so it reads the same for everyone and survives players leaving. Built only from
  locked-in scores plus what reveals already showed; Circle reports carry badge winners and counts, never
  who voted for whom. The share card (`components/wrapped/share-card.tsx`, `next/og`) uses nicknames only,
  members-only route. Satori needs `display: flex` on multi-child elements and sRGB colors (no oklch).
- **Premium** (`lib/premium/`): a pack unlocks only through `verifyAndGrant`, which asks the provider
  directly (paid, amount, currency, our payment id) and then calls the atomic `grant_entitlement` (once per
  room per pack; a second paid payment is marked `duplicate` for refund). Webhooks, the host's return from
  checkout and "Check payment" all just trigger that re-check — never trust a client or webhook body. Prices
  come from `content/packs.json` on the server. Pack questions carry `pack` and never appear in free games.
  `PAYMENT_PROVIDER=fake` gives a local test checkout (refused in production); E2E uses it.
- **Analytics & errors** (`lib/analytics/`): events go through `track` (server) / `trackClient`; names are
  whitelisted in `events.ts`. Never put nicknames, answers or raw error text in properties — run messages
  and paths through `sanitize.ts`. Server errors arrive via `instrumentation.ts`, phone errors via
  `/api/errors`; key routes are wrapped in `timed()` (`lib/timing.ts`). `metrics.ts` turns events into the
  §14 numbers (pure, unit-tested) for `/admin/metrics`, which exists only when `ADMIN_TOKEN` is set.
- **Retention** (`lib/retention.ts`): `cleanupExpiredData` deletes long-expired rooms and old history/events;
  paid payment records survive with `room_id` null. `/privacy` quotes the same periods — change both together.
- **Beta (Phase 7)**: feedback after Wrapped is one row per player per game (`saveFeedback` upserts).
  Abuse-prone routes use `isRateLimitedShared` (counted in Postgres via `rate_limit_hit`, keyed by a hash,
  falls back to the local count); chatty routes keep the in-memory `isRateLimited`. A payment settings error
  turns premium off (logged) instead of failing requests. Live at https://us-vs-us-chi.vercel.app; deploy and
  release steps in `docs/launch.md`. Migrations must be applied to BOTH Supabase projects (dev + production).
  Production settings are in the git-ignored `.env.vercel-production`; scripts read it with `--env-file`.
- **Preserved pages**: with Cache Components, Next keeps visited pages alive (hidden `<Activity>`), so state
  like "Creating…" survives navigation. Reset in-progress flags in an effect cleanup (see
  `create-room-form.tsx`), and on `pageshow` for pages left via a full redirect (checkout).
- **E2E**: shared helpers live in `tests/e2e/helpers.ts` (`expectAccessible` = axe WCAG A/AA scan,
  `expectPhoneFriendly`). Tag a spec `@layout` to also run it on the small-phone projects.
- **Emoji**: stick to Unicode ≤ 12 (a content test enforces it for questions); newer ones render as boxes
  on Windows 10 and older phones. Use `GradientText` for gradient headings so emoji keep their colors.
- **Anonymous players**: an httpOnly `uvu_session` cookie holds a random token; the DB stores only its
  SHA-256 hash (`lib/session.ts`). All reads/writes go through route handlers in `app/api/`.
- **Database access**: server only, via the secret key (`sb_secret_…`, service_role). RLS is on with no
  policies, so the browser's publishable key cannot touch tables.
- **Realtime**: the server broadcasts a payload-free `room_changed` ping on `room:<id>`; clients refetch
  `/api/rooms/<id>`. Never put room data or answers in a broadcast. `hooks/use-room.ts` also polls as a
  fallback and refetches on reconnect/visibility.
- **Touch targets**: buttons default to 44px (`h-11`), large to 56px. Inputs are 48px with 16px text (no
  iOS zoom). Don't shrink these.

## Commands

- `npm run dev` — dev server (in-memory rooms unless Supabase env vars are set)
- `npm run check` — lint + typecheck + unit tests
- `npm run test:e2e` — Playwright (starts its own dev server with in-memory rooms)
- `npm run build` — production build
