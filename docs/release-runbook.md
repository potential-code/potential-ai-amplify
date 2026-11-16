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
| `GTM_CONTAINER_ID` | leave unset (= off) until the AI Amplify client agrees to tracking; then `GTM-54W3N48W` (Main) | Google Tag Manager + cookie banner on the **client** service, read at run time (restart, no rebuild). See "Google Tag Manager and the cookie banner". |

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

## Consent and CRM sync

- **Migration 0040** adds four nullable/defaulted columns to `users`
  (`terms_accepted_at`, `marketing_opt_in` default false, `marketing_opt_in_at`,
  `marketing_consent_text`) and creates `crm_outbox`. It only adds things;
  existing learners keep `marketing_opt_in = false` and no terms date.
- **Sign-up now requires the Terms tick** on both paths (form and Anna's chat):
  the API answers 400 `TERMS_REQUIRED` without it. It is checked first, so a
  missing tick spends neither the verified email nor the invite code. Sign-up
  stays invite-only (invite code required; organisation links
  `?code=INVITE&org=CODE` unchanged). The optional marketing box is unticked by
  default; its wording is stored from the server's copy
  (`shared/marketingConsent.ts`, "...from AI Amplify by Potential.org...").
  Learners can change it later on their profile. Every event carries the
  learner's consent when it was queued: an opt-in always with
  `marketingConsentText` and `marketingConsentAt`; a withdrawal as
  `marketingOptIn: false` with `marketingConsentAt` = when it was turned off. A
  change also queues its own consent_changed event, so a withdrawal reaches the
  CRM promptly.
- **No email.** The CRM sync only queues and sends CRM events. It never sends an
  email and does not read `LEARNER_NOTIFICATIONS_ENABLED` or
  `REMINDER_EMAILS_ENABLED`; learner emails stay off until client sign-off.
- **Events queue from day one** in `crm_outbox` (keys `amplify:reg:<userId>`,
  `amplify:act1:<userId>`, `amplify:cert:<userId>:<courseId>`,
  `amplify:consent:<userId>:<ms>`): registration, first activation and course
  completed (once each), and consent_changed for each real change of the
  marketing setting. Synced learners are those who signed up with the consent
  step, plus existing learners who opt in on their profile (that queues their
  registration, dated to their original sign-up). Existing learners who never
  opt in are never sent; there is no backfill.
- **Consent is fresh when sent:** the first send of any event refreshes its
  consent fields from the learner's current row (an event can wait while sync
  is off) and saves them, so retries send the same bytes.
- **Sending is off** until `CRM_SYNC_ENABLED=true` with `CRM_INTAKE_URL`
  (https), `POTENTIAL_CRM_INTAKE_KEY` and `CRM_PROGRAM_ID` set (`CRM_COHORT_ID`
  optional; both must be UUIDs, or nothing is sent and one warning is logged).
  The five are listed in `docker-compose.yml`, so setting them in Dokploy
  reaches the server. Names and course names are cut to the CRM's 300
  characters. The drain runs every 30 seconds, at most 25 events a run, with
  retries (1 minute doubling to 6 hours, 20 tries). Rows queued before the
  program id was set get it on their first send.
- **Deploy the site and the API together.** A sign-up page loaded before this
  release sends no Terms tick and gets `TERMS_REQUIRED`; the API's message tells
  the person to refresh the page (the old form shows its generic error; the old
  chat passes the message on). Anna's sign-up prompt changed too (a
  `TERMS_REQUIRED` rule); its token fingerprint is computed from the same file,
  so it only matches when both are deployed.
- **Rate cap is per API process:** 25 events every 30 seconds each, so one
  replica stays at 50 a minute against the CRM's 120.
- **401/403/404 from the CRM** are treated as a wrong URL or key: nothing is
  marked failed, the run stops, one warning is logged until the config changes.
- **Logs and `last_error`** hold event keys, HTTP status and the CRM's error
  code only, never names, emails or response text.
- **Health:** `node scripts/crm-outbox-status.mjs` in the server container (or
  `node --env-file=../.env scripts/crm-outbox-status.mjs` from `server/`)
  prints pending / sent / failed counts (read-only). Each run that sends
  something logs "CRM sync run" with the same counts.
- **Rollback:** the old build ignores the new columns and table; leave them.

## Google Tag Manager and the cookie banner

- **Off until configured.** `GTM_CONTAINER_ID` on the **client** service
  (compose passes it through; default empty). Empty, unset or not a
  `GTM-XXXX` id (`^GTM-[A-Z0-9]{4,10}$`) means no GTM script, no banner and no
  "Cookie settings" link: the site is exactly as before. That is the kill switch.
- **Run time, not build time.** The browser reads it from `GET /public-config`
  (a Next route, `no-store`), so changing it in Dokploy needs a redeploy/restart
  of the client container, not a code change. Potential.org's "Main" container
  is `GTM-54W3N48W`; locally use a dummy such as `GTM-TEST1234`.
- **Consent Mode v2, default denied.** Before the GTM script is added the page
  sets `ad_storage`, `analytics_storage`, `ad_user_data` and
  `ad_personalization` to denied (`wait_for_update: 500`) and
  `ads_data_redaction`. A returning visitor's Accept is re-applied before GTM
  loads. Accept grants all four; Reject keeps them denied.
- **Cookieless pings ("advanced" Consent Mode).** With GTM loaded and consent
  denied (before a choice, and after Reject), Google tags can still send
  cookieless pings. For **zero** requests before Accept, set **"Require
  additional consent for tag to fire"** (ad_storage / analytics_storage) on
  every Google tag in the container; the site needs no change for that.
- **Reject removes this site's cookies only:** `_ga*`, `_gid`, `_gat*`,
  `_gcl_*`, host-only or set for `aiamplify.potential.org` exactly. Cookies set
  on the parent `.potential.org` are left alone on purpose: other Potential.org
  sites share them and keep their own consent. So Reject can delete them, set
  `cookie_domain` to `aiamplify.potential.org` (not `auto`) in the Google tag /
  GA4 configuration that fires on this host, and the same for the Conversion
  Linker.
- **Pages GTM runs on: an allowlist** (`isTrackedUrl` in
  `client/lib/consent/gtm.ts`). Only `/`, `/login`, `/sign-up` and
  `/dashboard/**` (the learner area), minus payment pages
  (`/dashboard/**/checkout`, `billing`, `payment(s)`, `invoice(s)`: the offers'
  Stripe checkout), and only when every query parameter is known to be
  harmless (`utm_*`, `gclid`, `gbraid`, `wbraid`, `expired`, `with`, `course`,
  `mentor`, `m`, `frame`, `success`, `v`; not `q`, which is free text). Google
  tags send the full address, so nothing that can carry a secret is tracked:
  `/mentor/setup`, `/partner/setup` and `/unsubscribe` (token links),
  **`/sign-up?code=` and `?org=` (AI Amplify is invite-only: anyone arriving
  through an invite or organisation link is not tracked on that visit; plain
  `/sign-up` is)**, `?token=`/`?key=`/`?secret=`, fragments with values, staff
  areas (`/admin`, `/mentor/dashboard`, `/partner`) and any page not on the
  list. **When you add a page, it is untracked until you add it there; never
  add a page whose URL can carry a token, code or key.**
- **GTM starts only in a clean document.** If the current document has shown
  an untracked URL at any point (e.g. `/sign-up?code=…` then a client-side
  move to `/login`), or the Navigation API lists one among this document's
  history entries, GTM does not start for the life of that document (no
  redirect, no reload). The next full page load on a tracked URL starts fresh.
  So an invite-link sign-up sends no `sign_up` event.
- **Referrer-Policy: `strict-origin`** on every page (next.config.ts), so a
  token or invite URL never shows up in `document.referrer` on a later page
  or in another site's logs. The API keeps helmet's `no-referrer`.
- **Leaving tracked pages.** GTM is loaded with a history guard: a client-side
  push to an untracked URL becomes `location.assign`, a replace becomes
  `location.replace` (no Back trap), and Back/Forward or a fragment change
  onto an untracked URL reloads before GTM's listeners run. Redirects after
  sign-in, mentor/partner setup and RequireAuth's role redirect use `goTo()`
  (full load into staff areas while GTM runs; client-side while GTM is off).
- **Banner and link.** No "free" anywhere (AI Amplify is paid). Choice in
  `localStorage["amplify.cookieConsent"]` = `{ choice, version, date }`; asked
  again after 12 months, or when `CONSENT_VERSION` in
  `client/lib/consent/consentStorage.ts` goes up (bump it when the wording or
  what is measured changes). "Cookie settings" (home footer, sign-in/sign-up
  footer, learner sidebar, learner Support page) reopens it; focus returns to
  the link after the choice. Neither shows on untracked pages. The banner sits
  above the learner phone tab bar and below menus and dialogs; it uses
  logical (start/end) placement, so it follows RTL.
- **Events.** Pushed only while GTM runs on a tracked page. Only these exact
  objects, never a name, email, phone, country, course name or id:
  | Event | When | Where |
  |---|---|---|
  | `{ event: 'sign_up_start', method: 'web_form' }` | first focus/typing in the sign-up form, once per page | `client/views/SignUp.tsx` (`startWebForm`) |
  | `{ event: 'sign_up_start', method: 'anna_chat' }` | Anna's "I want to register" (button or `/sign-up?with=sana`), once per page | `LandingRegistrationChat.tsx` (`handleRegisterClick`) |
  | `{ event: 'sign_up', method: 'web_form' \| 'anna_chat' }` | account created | `client/lib/createAccount.ts` |
  | `{ event: 'first_lesson_completed' }` | the learner's `first_step` badge is newly stored (first completed learning step) | `MilestoneWatcher` -> `consentStore.noteMilestones` |
  | `{ event: 'course_certificate' }` | a certificate is newly issued | same |

  **Why not the bell (as on SMEEP):** `LEARNER_NOTIFICATIONS_ENABLED=false`
  suppresses learners' in-app notifications too (`notify()` drops learners,
  no bell), so they can't be the signal. Instead the learner shell polls
  `GET /api/me/milestones` (signed-in, own data: `badge:first_step` from
  `user_badges` and `certificate:<id>` from `course_certificates`, both written
  exactly once, each with `earnedAt` and `ageSeconds` from the database's own
  clock). It polls every 60 s and on window focus, **only while GTM runs on a
  tracked page** (no requests otherwise). A milestone counts as new if it
  wasn't in this page's earlier fetches (or, on the first fetch, was stored in
  the last 10 minutes); it is then kept in `localStorage["amplify.gtmReported"]`
  (key + stored time) so other tabs and later pages don't report it again.
  Seen first on an untracked page, it is never sent. Switching learner
  notifications on later changes nothing here. In GTM, trigger Ads/GA4
  conversions on these custom event names.
- **Container:** Potential.org's Main container `GTM-54W3N48W` (shared by
  SMEEP, Hadafi and AI Amplify). Never load the old per-site containers (SMEEP
  `GTM-NGQNTZJ`, Hadafi `GTM-5C9G6FPK`, AI Amplify `GTM-PCDGSJLR`):
  `validGtmId` refuses them (treated as unset). The GA4 property is chosen
  inside GTM by hostname, and `cookie_domain` is set per host (here
  `aiamplify.potential.org`).
- **CSP:** the site's only Content-Security-Policy is `frame-ancestors 'self'`,
  so nothing was changed. If a script/connect CSP is added later, allow
  `www.googletagmanager.com`, `*.google-analytics.com`,
  `*.analytics.google.com`, `googleads.g.doubleclick.net`, `www.google.com`
  and `*.googlesyndication.com`.
- **Deploy:** site and API together (the API adds `/api/me/milestones`; no
  migration). Leave `GTM_CONTAINER_ID` unset: tracking stays OFF until the
  AI Amplify client agrees to it (Mamoon, 16 Nov). Then set
  `GTM_CONTAINER_ID=GTM-54W3N48W` and restart the client service.
- **Check after setting it:** in a private window: banner shows; DevTools
  `dataLayer[0]` is the consent default; Reject leaves no `_ga`/`_gcl` cookies
  for this host; Accept adds a `consent update` with all four granted;
  `/unsubscribe?token=x` and `/sign-up?code=X` have no `googletagmanager`
  script. In Tag Assistant, sign in as an admin from `/login`: the move to
  `/admin/...` must be a new page load with no GTM, and the `/login` session
  must show no History Change or page_view carrying an `/admin` URL (same for
  a learner opening an offer's checkout).

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
