# Beta launch and operations

The beta runs on **Vercel (Hobby, free)** with a **separate production Supabase project**, both in
**Singapore** (closest to players in the Philippines). Premium stays **off** until PayMongo verifies the
account.

## Where things are

| What                 | Where                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------- |
| Live site            | https://us-vs-us-chi.vercel.app                                                             |
| Metrics dashboard    | https://us-vs-us-chi.vercel.app/admin/metrics (log in with `ADMIN_TOKEN`)                   |
| Hosting              | Vercel project `us-vs-us` (team lemmynation), server region `sin1`                          |
| Production database  | Supabase project **UsVsUs Production** (`cporfhqqcsxovjebzmiv`), Southeast Asia (Singapore) |
| Development database | Supabase project **UsVsUs** (used by `npm run dev` through `.env.local`)                    |
| Production settings  | `.env.vercel-production` on your computer (git-ignored; never commit or share it)           |

`.env.vercel-production` is deliberately **not** called `.env.production.local`: Next.js loads that name
automatically in local production builds, which would point test builds at the real database.

Scripts read settings with `--env-file`, so values never appear on screen:

```bash
node --env-file=.env.vercel-production scripts/check-db.mjs
```

## Everyday: shipping a change

1. Merge to `main` after CI is green. Vercel deploys `main` to production on its own.
2. If the change has a new migration, run it in the production Supabase project (step 2 below). The old
   development project ("UsVsUs") is paused for good; production is the only database.
3. If questions changed, run `scripts/seed-questions.mjs` against production.
4. Check the live site:

```bash
node scripts/smoke.mjs https://us-vs-us-chi.vercel.app
```

It checks pages, security headers and link previews, then plays the start of a game with two simulated
phones, has a guest leave mid-game, and reports whether Mutation Machine (`CHAIN_REACTIONS`) is on. Each run
leaves one room called "Smoke" in the dashboard (two while Mutation Machine is on); they expire on their own.

For bigger releases, run the **full beta test**: the browser test suite against the live site (premium and
admin login are left out), one phone at a time, about 5 minutes:

```bash
LIVE_URL=https://us-vs-us-chi.vercel.app npx playwright test --config playwright.live.config.ts
```

It creates about 30 real rooms (players named Lem, Ana, Ben…) that count in the dashboard until cleaned
up. If one test stops at "Slow down a little", that's production's rate limit (10 new rooms a minute);
re-run just that test.

## Setting up from scratch

How the beta was first deployed (2026-10-09). Steps marked 🧑 need the account owner: creating accounts,
passwords and secret keys are never handled by an assistant.

### 1. Production database 🧑

1. In [Supabase](https://supabase.com/dashboard), **New project**: name it, generate a database
   password (keep it in a password manager), region **Southeast Asia (Singapore)**. Leave the security
   switches on their defaults (Data API on, expose new tables on): the server's secret key needs them, and
   every table has row-level security with no policies, so the public key still can't read anything.
2. **Project Settings → API Keys**: copy the publishable key (`sb_publishable_…`) and secret key
   (`sb_secret_…`) into `.env.vercel-production` (see the template at the end). Don't paste keys in chat.

### 2. Database schema

Open the project's **SQL Editor**, paste and **Run** every file in `supabase/migrations/` **in name order**
(oldest first), then `supabase/seed.sql`. They can be pasted one at a time or joined into one script; all
are safe to re-run. If Supabase warns about "destructive operations", that's the `drop … if exists` lines
that replace functions: run it.

Don't copy anything else between copying and pasting: the clipboard is easy to overwrite.

### 3. Questions

```bash
node --env-file=.env.vercel-production scripts/seed-questions.mjs
node --env-file=.env.vercel-production scripts/check-db.mjs
```

The first loads the question bank through the API (the SQL Editor can choke on the large
`seed-questions.sql`). The second must end with "Database is ready".

### 4. Hosting 🧑

1. Sign up at [Vercel](https://vercel.com) with GitHub (Hobby plan). Install the Vercel GitHub app for the
   `UsVsUs` repository only.
2. **Import** `lemmynation/UsVsUs`. The Next.js preset is detected; leave build settings alone.
3. **Environment Variables**: paste the five `NAME=value` lines from `.env.vercel-production` into the
   first Key box (Vercel splits them into rows). Set every row to **Production** only, so preview builds
   of pull requests never touch the production database, and keep them marked Sensitive.
4. **Create Project**, then **Deploy**. `vercel.json` pins the server to Singapore and schedules the daily
   data cleanup (3 AM Manila time).
5. Run the smoke test against the new address.

If you add your own domain later, set `APP_URL` to it in Vercel and **redeploy**: link previews bake the
site address in when the site is built.

### `.env.vercel-production` template

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_…
SUPABASE_SECRET_KEY=sb_secret_…
ADMIN_TOKEN=<random>   # your login for /admin/metrics
CRON_SECRET=<random>   # lets Vercel's daily cleanup job run
```

Make each random value with:

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
```

Do **not** set `ROOM_STORE`, `PAYMENT_PROVIDER`, `RATE_LIMITS` or any `PAYMONGO_…` key in production.

## During the beta

- Check `/admin/metrics` weekly: activation, completion, shares, replays, errors, speed and player
  feedback. Per the design doc, **don't add new game types until the metrics have been reviewed.**
- Free Supabase projects pause after a week with no activity; the daily cleanup job keeps production awake.
  The development project can pause; resume it from the Supabase dashboard when needed.

## Later: turning the Party Screen on 🧑

The Party Screen (a TV or laptop showing a Mutation Machine game, UsVsUs 4.2 Sprint 2) is built behind
`PARTY_SCREEN=on`, which only works together with `CHAIN_REACTIONS=on`.

1. Run `supabase/migrations/20261018000000_party_screen.sql` in the production SQL Editor (migration 12:
   the `party_displays` table, `approve_party_display`, and the cleanup job's extra statement).
2. In Vercel, add `PARTY_SCREEN=on` (Production) and **redeploy**.
3. Check it: open `/party` on a laptop, create a Mutation Machine room on a phone, Lobby → **Connect a TV**,
   type the code. To turn it off again, remove the variable and redeploy (connected TVs just stop updating).

## Later: turning premium on 🧑

1. Get the PayMongo account verified for live payments.
2. Upgrade Vercel to **Pro** (Hobby is for non-commercial use only).
3. In Vercel, add `PAYMONGO_SECRET_KEY` (`sk_live_…`, Sensitive, Production only) and `APP_URL`
   (`https://us-vs-us-chi.vercel.app` or your domain).
4. In PayMongo → Developers → Webhooks, add `<site>/api/payments/webhook` for
   `checkout_session.payment.paid`, then add its secret as `PAYMONGO_WEBHOOK_SECRET`.
5. Redeploy. The pack picker appears in Circle (Chaos Night) and Couple (Date Night Deep Dive) lobbies on its own.
   A pack belongs to the phone that bought it and unlocks in every room that phone hosts. If a payment setting is wrong, premium
   stays hidden (the game keeps working) and the reason is in Vercel's logs.
