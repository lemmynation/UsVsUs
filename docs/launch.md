# Beta launch checklist

The beta runs on **Vercel (Hobby, free)** with a **separate production Supabase project**, both in
**Singapore** (closest to players in the Philippines). Premium stays **off** until PayMongo verifies the
account. Steps marked 🧑 need you (accounts, keys, clicks in dashboards); the rest is already in the code.

To make a random secret, run this and copy the output (do it once per secret):

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
```

## 1. Production database (Supabase) 🧑

1. Create a new project at [supabase.com](https://supabase.com). **Region: Southeast Asia (Singapore).**
   Save the database password somewhere safe.
2. In **SQL Editor**, run every file in `supabase/migrations/` **in name order** (oldest first), then
   `supabase/seed.sql`, then `supabase/seed-questions.sql`. Each is safe to re-run.
3. **Project Settings → API Keys**: note the Project URL, the publishable key (`sb_publishable_…`) and the
   secret key (`sb_secret_…`). Don't paste them in chat; they go straight into Vercel.

## 2. Hosting (Vercel) 🧑

1. Sign up at [vercel.com](https://vercel.com) **with your GitHub account** and **Import** the
   `lemmynation/UsVsUs` repository. Framework: Next.js (auto-detected). Leave build settings as they are.
2. Before the first deploy, open **Environment Variables** and add, for **Production**:

   | Name                                   | Value                                                  |
   | -------------------------------------- | ------------------------------------------------------ |
   | `NEXT_PUBLIC_SUPABASE_URL`             | Project URL from step 1                                |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…` from step 1                         |
   | `SUPABASE_SECRET_KEY`                  | `sb_secret_…` from step 1 (mark as **Sensitive**)      |
   | `ADMIN_TOKEN`                          | a new random secret — your login for `/admin/metrics`  |
   | `CRON_SECRET`                          | another random secret — lets the daily cleanup job run |

   Do **not** set `ROOM_STORE`, `PAYMENT_PROVIDER`, `RATE_LIMITS` or any `PAYMONGO_…` keys.

3. **Deploy.** `vercel.json` already pins the server to Singapore (`sin1`) and schedules the daily data
   cleanup (3 AM Manila time).
4. Your site is at `https://<project>.vercel.app`. Link previews use that address automatically. If you
   later add your own domain, set `APP_URL` to it (e.g. `https://usvsus.ph`) and **redeploy**: the
   address is baked in when the site is built.

## 3. Smoke test

Send me the site address and I'll run `node scripts/smoke.mjs https://<your-site>`. It checks the pages,
security headers and link previews, then plays the start of a real game with two simulated phones.
Then try it yourself: create a room on your phone, send the invite to a friend over Messenger, and play.

## 4. During the beta

- Open `https://<your-site>/admin/metrics` and log in with `ADMIN_TOKEN` to see activation, completion,
  shares, replays, errors, speed and player feedback.
- Per the design doc: **don't add new game types until the metrics have been reviewed.**
- Free Supabase projects pause after a week with no activity; the daily cleanup job keeps it awake.

## 5. Later: turning premium on 🧑

1. Get the PayMongo account verified for live payments.
2. Upgrade Vercel to **Pro** (Hobby is for non-commercial use only).
3. In Vercel, add `PAYMONGO_SECRET_KEY` (`sk_live_…`, Sensitive) and `APP_URL` (your site address).
4. In PayMongo → Developers → Webhooks, add `https://<your-site>/api/payments/webhook` for
   `checkout_session.payment.paid`, then add its secret as `PAYMONGO_WEBHOOK_SECRET`.
5. Redeploy. The pack picker appears in Circle lobbies automatically. If a payment setting is wrong,
   premium stays hidden (the game keeps working) and the reason is in Vercel's logs.
