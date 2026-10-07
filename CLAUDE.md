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
- **Anonymous players**: an httpOnly `uvu_session` cookie holds a random token; the DB stores only its
  SHA-256 hash (`lib/session.ts`). All reads/writes go through route handlers in `app/api/`.
- **Database access**: server only, via the service-role key. RLS is on with no policies, so the browser's
  anon key cannot touch tables.
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
