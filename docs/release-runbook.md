# AI Amplify release runbook: the revamp (redesign/modern-lms)

What this release is: the new design (SMEEP's approved look in Amplify purple),
sign-in on Better Auth, the security fixes, and the approved feature groups
(learner motivation, admin tools, events and organisations, AI safety).
Live today: `main` at bab7225 (integrity release). Dokploy project "AI Amplify",
compose app `ai-amplify-app-491gvj`, autoDeploy off.

## 1. Before deploying (Dokploy → environment)

Set these on the compose app first. Name only; never paste values into chat or tickets.

| Variable | Value | Why |
|---|---|---|
| `BETTER_AUTH_SECRET` | 32+ random characters, new | Signs session cookies. Production refuses to start with a shorter one. Falls back to `JWT_SECRET`, but set it. |
| `BETTER_AUTH_URL` | `https://aiamplify.potential.org` | The public site; sessions live there. Defaults to `FRONTEND_URL`. |
| `LEARNER_NOTIFICATIONS_ENABLED` | leave unset (= `false`) | Learner bell, banners and announcement emails stay off until the client signs off. |
| `REMINDER_EMAILS_ENABLED` | leave unset (= `false`) | Session/event reminder and booking emails stay off until sign-off. |
| `ZOOM_ACCOUNT_ID`, `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET`, `ZOOM_HOST_USER_ID` | optional | Zoom meetings for live events. Without them the admin screen says Zoom isn't connected and offers "Other link" or "In person". |
| `ZOOM_WEBHOOK_SECRET_TOKEN` | optional, with Zoom | Verifies Zoom's calls to `/api/webhooks/zoom`. |
| `TRUSTED_PROXIES` | only if the proxy isn't on a private range | Finding the visitor IP for rate limits. |

Unchanged and still needed: `DATABASE_URL`, `JWT_SECRET`, `FRONTEND_URL`, `FROM_EMAIL`,
SMTP/SES, Stripe, `COPILOT_SERVICE_JWT_SECRET`, `NEXT_PUBLIC_AI_BACKEND_URL`.
`API_INTERNAL_URL` defaults to `http://server:5000` (the site forwards `/api` and `/uploads`).

Take a database backup right before deploying.

## 2. Deploy

Merge to `main`, then deploy the compose app in Dokploy. The server container
runs migrations on start (`entrypoint.sh` → `scripts/migrate.mjs`): 0027–0036, all additive.

| Migration | What it does |
|---|---|
| 0027 better_auth | Auth tables; every existing user gets a credential row with their current bcrypt hash and is marked `legacy_account` (verifies their email by a code on first sign-in). `users.password_hash` is kept. |
| 0028 newsletter | `newsletter_subscribers` (the homepage form now really stores sign-ups). |
| 0029 notifications | Bell notifications. |
| 0030 achievements | Badges, leaderboard opt-out; backfills an "opening" points ledger entry so totals match. |
| 0031 announcements | Announcements; `users.announcement_emails` (default on). |
| 0032 video_position | Where each learner stopped in a video. |
| 0033 event_scheduling | Real start/end times backfilled from the old date + "04:00 PM" text as UAE time (noon if no time); bookings; Zoom fields; then start/end become required. |
| 0034 organisations | Partner organisations, partner invites, `users.organisation_id`. |
| 0035 ai_turns | AI chats saved for learners in an organisation (only while they're in one). |
| 0036 ai_reports | "Report this answer" reports. |

Everyone is signed out by the change of sign-in system and signs in again.

## 3. Check right after (the live A–Z test)

Use a marker only the new build has: the sign-in page says "Have an invite? Create your account", and `/api/auth/ok` answers `{"ok":true}`.

1. Homepage, course list, 404 page; `/sign-up` asks for an invite code.
2. Sign in as an existing learner: password, then the one-time email code (legacy account).
3. Learner: Home, a course (preview before enrolling, then a lesson video, resume), Achievements, Events (book a place), Profile (set/change password, email preferences).
4. Admin: Dashboard (Impact), Analytics (+ export), Announcements (note says learners are paused), Live events (new event form), Organisations, AI safety, Learners export.
5. Mentor: dashboard, calendar, sessions.
6. Anna: guest chat on the homepage; Ask Anna signed in; copy / read aloud / report under an answer.
7. Server logs: "Migrations complete", no errors on boot.

## 4. Anna and potential-ai

Amplify's tokens now carry a scope and the fingerprints of its five Anna prompts
(`shared/anna/prompts.ts`). potential-ai enforces both for any token that carries a
scope, so this starts with the deploy; nothing to switch on. Check in step 3 that each
Anna chat still answers as Anna (a prompt potential-ai doesn't recognise is ignored
quietly, and the agent falls back to its default prompt).

Optional, about an hour after (once old tokens have expired): add `ai-amplify` to
`STRICT_TOKEN_PLATFORMS` on potential-ai, which is shared with SMEEP, VX, SAMA,
FYA/YLP and Hadafi. It only affects tokens without a scope, which this build no longer mints.

## 5. Rollback

Redeploy the previous image (`main` before the merge; a `safekeeping/` branch is cut at merge time).
The schema changes are additive, so the old build runs on the new database, with one exception:
0033 made event start/end required, which the old build doesn't set. Before rolling back, run:

```sql
ALTER TABLE live_events ALTER COLUMN starts_at DROP NOT NULL, ALTER COLUMN ends_at DROP NOT NULL;
```

Users sign in again with their password (the old build reads `users.password_hash`, which is kept).

## Switching learner messages on later (after client sign-off)

Set `LEARNER_NOTIFICATIONS_ENABLED=true` (bell, banners, announcements, adding learners to an
organisation by email) and, separately, `REMINDER_EMAILS_ENABLED=true` (reminder and booking
emails), then redeploy.

## Rehearsed (4 Nov 2026, local)

A database built from `main` (bab7225: its 26 migrations, the seed, plus learners with old
passwords, enrollments, progress and points) was upgraded by the release images:

- All 37 migrations applied on container start; a restart re-ran them as a no-op.
- Every existing user kept their password hash and was marked to confirm their email once;
  signing in with the old password led to the one-time code step.
- Event times backfilled from "04:00 PM" as 16:00 UAE time; enrollments, unit progress and the
  30-point balance carried over.
- Through the site, sign-in rate limits key on the visitor IP from the edge proxy's
  `X-Forwarded-For` (all-private hops fall back to one shared bucket, which is why the rehearsal
  logged a warning before that header was set).
- AI mentor replies stream through the production site build (chunks arrive as they're written).
- Without Zoom credentials, creating a Zoom event is refused with "Zoom isn't connected on this server yet".
- Not covered locally: code emails (production sends through SES), Anna chats (no local AI backend),
  a production data dump (none provided yet).
