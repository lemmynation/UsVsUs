<!--
Verbatim text export of docs/design.docx (the source of truth).
The original has no Word heading/table styles, so tables appear as one cell per line.
If this file and the .docx disagree, the .docx wins.
-->

US vs. US

Product + UX + Technical Design Document

Implementation-ready specification for Claude Code

Product

Us vs. Us

Platform

Mobile-first responsive web app

Primary modes

Couple / Friends / Circle

MVP objective

Validate play completion, sharing, invitations, and first paid pack

Version

MVP v1.0 — October 2026

Core promise: “How well do you really know your people?”

1. Product Vision

Us vs. Us is a browser-first social game for couples, two friends, and circles of friends. A host creates a room, shares a link, and everyone can join from a phone without installing an app. Players answer prediction and voting games in real time, see animated reveals, earn scores, and finish with a shareable Wrapped-style result.

Product principles

Zero-friction entry: link → nickname → room. No account required for MVP.

Fun before analytics: every screen should feel playful, fast, and social.

The reveal is the reward: answers stay hidden until the round reveal.

Mobile first: designed primarily for one-handed portrait phone use.

Shareability is part of the product, not an afterthought.

Premium purchases enhance an active social moment; they should not block the basic experience.

Success hypothesis

If the experience is genuinely fun, a meaningful percentage of completed rooms should either share their result or start/invite another room. The MVP should test that loop before large investments in content, native apps, accounts, or subscriptions.

2. Target Users & Modes

Mode

Players

Primary occasion

Tone

Couple

2

Date night, long-distance, anniversary

Warm, teasing, romantic

Friends

2

Best friends, catch-up, hangout

Funny, competitive

Circle

3–10

Party, barkada night, reunion, Discord call

Chaotic, social, reveal-heavy

Mode-specific content

Couple: relationship preferences, habits, memories, date choices, playful disagreements.

Friends: personality, habits, shared memories, preferences, “who knows whom better.”

Circle: group voting, most-likely-to prompts, hot takes, and group awards.

3. MVP Scope

Must ship

Landing page and mode selection.

Create room and generate short room code + shareable join URL.

Join by nickname; host can start when minimum player count is reached.

Realtime lobby and realtime round progression.

Three game engines: Mind Reader, Who’s More Likely, and This or That.

Mode-aware question bank.

Score calculation and animated reveal.

End-of-game Wrapped report and shareable portrait card.

One paid premium pack (recommended: Chaos Night for Circle) with room-level unlock.

Basic event analytics and error logging.

Explicitly out of MVP

Native iOS/Android apps.

Public profiles, followers, DMs, or social feed.

Complex AI-generated questions during live play.

Photo/drawing games, voice/video, persistent relationship timeline.

Subscriptions.

Large admin CMS; question content can begin as seeded database records.

4. Core User Flows

Host flow

Open landing page.

Choose Couple, Friends, or Circle.

Enter nickname and optional room name.

Create room.

Receive join URL and room code.

Share via native Web Share API or copy link.

Watch players join lobby.

Choose Free Game or Premium Pack.

Start game.

Play rounds and view reveals.

View Wrapped result.

Share result or start another game.

Guest flow

Open invite link → enter nickname → join lobby → wait for host → play → Wrapped → share/start own room.

Payment flow

Host taps a locked pack → sees pack preview and price → checkout → provider returns success → server verifies payment → room entitlement is created → pack unlocks for every player in that room. Only one purchase is required per room.

5. Information Architecture & Screens

Screen

Purpose / key elements

S01 Landing

Brand, tagline, Couple/Friends/Circle cards, primary CTA “Start a game”, secondary “Join with code”.

S02 Create Room

Selected mode, nickname, optional room name, create button.

S03 Join Room

Room name/mode, nickname field, join button; clear invalid/full/expired states.

S04 Lobby

Player avatars/initials, join code, share button, host controls, ready state.

S05 Pack Select

Free game plus locked premium packs with concise value proposition and room price.

S06 Round Intro

Round title, one-line rules, progress e.g. Round 1 of 3.

S07 Question

Large prompt, large tap targets, timer optional/off by default, answer confirmation.

S08 Waiting

“Locked in” state while other players answer; no answer leakage.

S09 Reveal

Animated answers/votes, score change, short contextual reaction copy.

S10 Scoreboard

Compact standings between rounds; Continue controlled by host or auto-advance.

S11 Wrapped

Overall score/awards, category scores, funniest disagreement, share CTA, play-again CTA.

S12 Premium Checkout

Pack benefits, price, payment action, cancellation/back state.

6. Game Design

6.1 Mind Reader

Best for Couple/Friends. The subject answers a preference question secretly; the other player predicts the subject’s answer. Roles alternate. Correct prediction = 100 points. No partial credit in MVP.

Example: “What would Lem choose for a spontaneous vacation?”

Answer format: 2–4 options.

Reveal: subject answer first, then prediction, then points.

6.2 Who’s More Likely

All players select the person who best fits the prompt. In Couple/Friends, agreement earns 75 points each. In Circle, this is primarily a voting/award game; show vote percentages and award the selected player a badge rather than treating popularity as skill.

Example: “Who is most likely to become a millionaire?”

Votes remain anonymous by default in Circle MVP.

6.3 This or That

For two-player modes, each player predicts the other player’s choice between two options. Each correct prediction earns 50 points. Circle mode can instead use Hot Take-style group voting in a later release.

Example: “Fancy dinner or street food?”

Game session composition

Recommended free session: 3 rounds × 5 questions = ~8–12 minutes. Keep sessions short enough to replay.

Recommended premium session: 4–5 rounds × 5–7 questions = ~15–25 minutes.

7. Scoring & Wrapped

Scores are entertainment metrics, not scientific compatibility measures. UI copy must use terms such as “Us Score”, “Game Score”, or “Same Brain Score”; avoid claims of psychological or relationship compatibility.

Event

Points

Notes

Mind Reader correct prediction

100

Per prediction

This or That correct prediction

50

Per prediction

Who’s More Likely agreement (2-player)

75

Both picked same person

Circle voting

0 skill points

Produces awards/badges instead

Wrapped output

Room/player names.

Us Score / total points normalized to 0–100 where applicable.

Round/category breakdown.

Winner for two-player modes.

Most surprising disagreement.

Circle awards such as Future Millionaire / Worst Texter / Always Late.

Short deterministic roast/reaction in MVP; AI-generated roast can be added after validation.

1080×1920 portrait share card suitable for Stories.

8. Premium & Monetization

MVP monetization should be one-time, room-level purchases. Do not require a subscription at launch. A purchase unlocks the pack for the active room/session and all participants.

Pack

Mode

Concept

Suggested test price

Chaos Night

Circle

More provocative/funny voting, awards, longer Wrapped

₱99 launch test

Date Night

Couple

Romantic predictions and deeper questions

₱99

Anniversary

Couple

Memory-heavy prompts + special Wrapped

₱149

Exposed

Friends/Circle

Habits, secrets, playful call-outs

₱99–₱149

Payment provider should be abstracted behind a server-side payment service so the product can support Philippine payment methods (e.g., cards/e-wallets through the chosen provider) without coupling game logic to a single gateway.

9. Visual & Interaction Design System

Visual direction: energetic, polished, slightly mischievous—not childish. Use large typography, rounded cards, subtle gradients, micro-animations on reveals, and generous spacing. The interface must remain readable in noisy social settings.

Token

Guidance

Canvas

Mobile-first 390×844 reference viewport; responsive through desktop.

Typography

Bold display heading + highly legible sans-serif body. Avoid tiny text.

Touch targets

Minimum ~44×44 px; primary answers should be much larger.

Color

Use a neutral base plus mode accents: Couple warm/pink-purple; Friends blue-violet; Circle orange-violet. Ensure WCAG contrast.

Motion

150–350 ms for normal UI; 500–900 ms reveal sequences. Respect prefers-reduced-motion.

Cards

Rounded 18–24 px, soft elevation, clear selected/locked states.

Feedback

Haptics where supported are optional; always provide visual feedback.

10. Recommended Technical Architecture

Recommended MVP stack: Next.js (TypeScript) + Tailwind CSS + shadcn/ui for the web client, Supabase for Postgres/Auth-less session data/realtime, and server-side route handlers/server actions for trusted game and payment operations. Deploy the web app to a managed Next.js host.

Architecture rules

Never trust client-submitted scores, pack entitlements, or payment success.

Use server-generated room IDs and human-friendly short join codes.

Realtime broadcasts synchronize lobby/game state; database remains source of truth.

Anonymous players receive a signed/session token stored in secure cookie/local storage strategy; do not require email.

Question content is data-driven; game engines must not hardcode individual questions.

Separate domain logic (scoring/state transitions) from UI components.

Use feature flags for premium/experimental rounds.

Suggested app structure

app/

page.tsx

create/

join/[code]/

room/[roomId]/

api/payments/

components/

game/

room/

wrapped/

lib/

game-engine/

scoring/

payments/

supabase/

analytics/

types/

game.ts

room.ts

supabase/

migrations/

seed.sql

tests/

unit/

e2e/

11. Data Model

Table

Core fields

rooms

id UUID PK; join_code unique; mode; name; host_player_id; status; selected_pack_id; current_round; current_question; created_at; expires_at

players

id UUID PK; room_id FK; nickname; session_token_hash; is_host; joined_at; last_seen_at

packs

id; slug; name; mode_scope; price_minor; currency; is_free; active

questions

id; pack_id nullable; mode; game_type; prompt; options JSONB; subject_rule; active; sort_weight

game_sessions

id; room_id; pack_id; status; started_at; ended_at; state_version

rounds

id; game_session_id; game_type; round_index; status; subject_player_id nullable

responses

id; round_id; question_id; player_id; answer JSONB; submitted_at

scores

id; game_session_id; player_id; points; metadata JSONB

payments

id; room_id; provider; provider_payment_id; amount_minor; currency; status; created_at

entitlements

id; room_id; pack_id; payment_id; granted_at

events

id; anonymous_session_id; room_id nullable; event_name; properties JSONB; created_at

Room lifecycle

LOBBY → IN_GAME → WRAPPED → COMPLETED. Also support EXPIRED and ABANDONED.

Rooms should expire automatically after a configurable period (e.g., 24 hours) unless a future saved-account feature changes this.

12. Realtime State Machine

State

Behavior

LOBBY

Players join/leave; host selects pack and starts.

ROUND_INTRO

All clients receive round metadata.

QUESTION_OPEN

Eligible players submit answers; submissions are private.

WAITING

Client has submitted; waits for required responses.

REVEAL

Server computes result/points and publishes reveal payload.

SCOREBOARD

Updated scores/awards shown.

NEXT_QUESTION / NEXT_ROUND

Server advances canonical state.

WRAPPED

Final report generated and frozen for sharing.

All transitions that affect scoring or reveal data must be server-authoritative and idempotent. Use a state_version or equivalent optimistic concurrency mechanism to prevent double advancement.

13. Question Content Model

Every question should be tagged so packs can be assembled without code changes.

mode: couple | friends | circle

game_type: mind_reader | most_likely | this_or_that

intensity: safe | playful | bold

category: food | travel | habits | money | memories | personality | romance | chaos

min_players / max_players

locale: initially en-PH; content may mix natural Filipino expressions sparingly if desired.

premium_pack_id nullable

Content safety

Default packs should avoid humiliating, discriminatory, coercive, sexually explicit, self-harm, criminal, or otherwise unsafe prompts. Players must be able to skip a question without penalty. Any future 18+ pack should require explicit age gating and separate content review.

14. Analytics & Validation

Instrument the funnel before adding many features.

landing_view, mode_selected, room_created, invite_shared, player_joined, game_started, question_answered, game_completed, wrapped_viewed, wrapped_shared, play_again_clicked, premium_pack_viewed, checkout_started, purchase_succeeded, purchase_failed.

MVP decision metrics

Room activation: % of created rooms that reach game_started.

Completion: % of started games that reach Wrapped.

Invite efficiency: average guests joined per created room.

Share rate: % of completed rooms that trigger share/copy.

Replay/viral loop: % of participants who create another room within 7 days.

Paid conversion: % of eligible rooms purchasing the premium pack.

Technical health: realtime disconnect rate, failed joins, payment failures, p95 page/interaction latency.

15. Privacy, Security & Abuse Controls

Collect the minimum personal data necessary. MVP nicknames need not be real names.

Do not expose private responses before reveal.

Use row-level security/database policies where applicable.

Rate-limit room creation, joining, answer submission, and payment endpoints.

Sanitize room names/nicknames and enforce length limits.

Use server-side verification for payment webhooks and entitlement creation.

Do not store payment card data.

Provide report/leave controls and a simple room kick control for the host if abuse appears during testing.

Set a retention policy for expired anonymous rooms and responses; document it in privacy copy.

16. Accessibility & Resilience

Keyboard navigable on desktop; visible focus states.

WCAG-aware contrast and no color-only correctness indicators.

prefers-reduced-motion support.

Reconnect gracefully after brief mobile network loss and restore current room state.

Prevent duplicate submissions on refresh/retry.

Show actionable empty/error states: room full, expired code, disconnected, payment pending.

17. Acceptance Criteria for MVP

☐ Two users can create/join a Couple or Friends room from separate devices and complete a full free game.

☐ 3–10 users can join a Circle room and complete a supported voting game.

☐ No answer is visible to another player before the reveal state.

☐ Score calculations are deterministic and covered by unit tests.

☐ Refreshing/reconnecting returns a player to the correct room/game state.

☐ Host cannot start below minimum player count.

☐ Premium pack cannot be played without a verified entitlement.

☐ A successful test payment unlocks the pack for the whole room exactly once.

☐ Wrapped renders correctly on common mobile widths and can be shared/downloaded as a portrait image.

☐ Core funnel events are recorded.

☐ E2E happy paths pass for Couple and Circle.

18. Claude Code Implementation Plan

Phase

Deliverable

Phase 0 — Foundation

Initialize Next.js TypeScript app, Tailwind/shadcn, lint/format/test tooling, env validation, Supabase clients, CI. Create README and CLAUDE.md.

Phase 1 — Rooms

Database migrations; create/join room; anonymous player session; lobby; share/copy invite; host/min-player rules.

Phase 2 — Realtime

Presence/reconnect; canonical room state; server-authoritative state transitions; waiting/reveal synchronization.

Phase 3 — Game Engine

Question schema; seed content; implement Mind Reader, Who’s More Likely, This or That; scoring unit tests.

Phase 4 — Wrapped

Final aggregation; awards; responsive Wrapped screen; deterministic roast copy; portrait share image.

Phase 5 — Premium

Pack catalog; locked UI; payment service abstraction; checkout/webhook; verified room entitlement; test mode.

Phase 6 — Analytics & QA

Event tracking; error monitoring; Playwright E2E; mobile viewport QA; accessibility pass; reconnect/error cases.

Phase 7 — Beta

Deploy production beta; seed enough content for repeat play; collect feedback; do not add new game types until metrics are reviewed.

19. CLAUDE.md Starter Instructions

Copy/adapt the following into the repository’s CLAUDE.md:

# Us vs. Us — Engineering Rules

Build a mobile-first social game web app. Follow the product/design document as the source of truth.

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

20. First Claude Code Prompt

Use this after placing this design document (or a Markdown export of it) in the repository:

Read the Us vs. Us design document and treat it as the product source of truth.

We are implementing MVP Phase 0 and Phase 1 only.

Do not build game rounds or payments yet.

First:

1. Inspect the repository.

2. Propose the folder structure, dependencies, database schema/migrations, anonymous session approach, and room lifecycle.

3. Identify any conflicts with the design document.

4. Wait for approval before modifying files.

After approval, implement:

- Next.js TypeScript foundation

- mobile-first base design system

- Supabase setup

- create room

- join room by code/link

- anonymous player session

- realtime lobby

- host controls and minimum-player validation

- invite/share link

- tests for room creation/join rules

Run lint, typecheck, unit tests, and relevant E2E tests before declaring the phase complete.

Do not implement features outside this scope.

21. Post-MVP Roadmap (Only After Validation)

Drawing Battle and Caption Battle.

AI-generated roast/report using bounded structured inputs.

Custom questions and personalized event packs.

Saved accounts/history and annual/couple Wrapped.

PWA installation and push notifications where useful.

Additional languages/localized Filipino content.

Subscriptions only after repeat usage demonstrates recurring value.

Native apps only if retention and distribution justify app-store complexity.

22. Product Guardrail

Do not optimize for number of features. The MVP wins if people can join instantly, laugh during reveals, finish the game, share the result, invite others, and—most importantly—some strangers pay for a premium room. Every feature request should be evaluated against those behaviors.

Us vs. Us • MVP Design Document • October 2026
