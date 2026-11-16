# Operator access (Maya, the AI operator)

Maya calls the AI Amplify admin API without a browser session. She sends an
**operator key** as `Authorization: Bearer <key>`, and the server treats the
request as coming from one dedicated admin account, the **service account**
(`maya@potential.org`). A key reaches only the routes in the
[allowed-route table](#allowed-routes) below. Every change she makes is written
to `admin_audit_log`. Every change made by a human admin is written there too.

AI Amplify is a **paid, invite-only client programme**, and learner messages
stay off until the client signs off (`LEARNER_NOTIFICATIONS_ENABLED=false`).
So a key here can do less than on SMEEP: it **sends nothing to learners**,
**never changes a price, what is on sale or a payment record** (no price
fields and no publish/unpublish on an offer edit), **writes no invite code or
organisation** (Maya asks her Lead for those), and **never sees a live invite
code or organisation sign-up code** (on AI Amplify the invite code is the
login). Reading invites, organisations and offers stays open, with those codes
left out for a key.
See [Deliberately excluded routes](#deliberately-excluded-routes).

Ported from SMEEP (`potential-smeep`, `server/docs/operator-access.md`),
including its hardening: a key can't hand out a login, the service account
can't sign in even with its env var unset, partner setup links are hidden from
a key, absolute-form request lines are normalised, and callers that hang up
are still audited.

## How it works

| Piece | Where |
| --- | --- |
| Key check, service-account lookup | `server/auth/operatorKeys.ts`, called from `server/middleware/authenticate.ts` |
| What a key may call (allowlist, exclusions, offer price/status check) | `server/auth/operatorScope.ts` |
| Codes left out for a key | `server/controllers/admin.controller.ts` (invites, needs-attention), `server/controllers/organisations.controller.ts` (organisations, dashboard, partner setup links) |
| Service-account sign-in refusal | `server/auth/index.ts` (Better Auth `before` hook) |
| Audit log middleware | `server/middleware/audit-log.ts` (mounted on `/api` in `server/app.ts`) |
| Audit table | `admin_audit_log`, migration `0041_admin_audit_log` |
| Scripts | `server/scripts/generate-operator-key.mjs`, `server/scripts/create-operator-user.mjs` |
| Tests | `server/tests/operator-access.test.ts`, `operator-scope.test.ts`, `admin-audit-log.test.ts` (with `tests/node/audit-pipelining.harness.ts`, run under real Node), `operator-scripts.test.ts` |

Environment (server service):

- `OPERATOR_API_KEYS`: one or more `label:sha256hex` entries, separated by
  commas. These are SHA-256 hashes of the keys. The raw keys are never on the
  server. **If this is unset or empty, Bearer headers are ignored entirely.**
- `OPERATOR_SERVICE_USER_EMAIL`: the admin account every valid key acts as.
  For AI Amplify: `maya@potential.org`.

Rules the server enforces:

- A request that carries `Authorization: Bearer …` on an `/api` app route
  (with keys configured) is decided by the key alone. If the key is valid, the
  request acts as the service account. Otherwise the answer is **401**, even
  if a valid session cookie came with it.
- The answer is also 401 if the service account is missing, or if its role is
  not `admin`. The account is looked up on every request, so a role change
  takes effect immediately.
- **A key is not full admin.** It reaches only the method + path patterns in
  the [allowed-route table](#allowed-routes) (`OPERATOR_ROUTES` in
  `server/auth/operatorScope.ts`). Any other route answers **403**
  (`FORBIDDEN`) for a key and logs `[operator-scope] refused <METHOD> <route
  shape>`, with ids replaced by `:param`. Admin sessions are not affected.
  Request targets with dot segments, backslashes, `//` or encoded `.` `/` `\`
  are refused for keys, so the allowlist and Express always agree on the route.
- **No price changes, no publishing.** An offer edit with a key (`PATCH
  /api/admin/offers/:id`) may change the title, category and image only. Any
  price field in the body (`price`, `priceLabel`, `priceBefore`, `pointsCost`)
  or a `status` field (publishing a paid offer puts it on sale through Stripe
  checkout; unpublishing takes it off), each matched by name whatever its
  case, answers **403** before validation, and nothing is changed. The refusal
  is in the audit log as a 403 row with the body it sent. Admin sessions are
  not affected. The same check sits on `POST /api/admin/offers` as a second
  line, though that route is out of a key's scope anyway.
- **A key can't hand out a login** (SMEEP decision by the CEO, Nov 2026): the
  partner invite and mentor application approve/reject are out of scope,
  because the key would choose who gets the login. A person does these in the
  admin UI.
- Partner setup links (live sign-up tokens) are left out of the partner list
  response for a key, so a key can't pick up someone else's pending invite. An
  admin in the browser still sees them.
- **A key never sees a live invite or sign-up code.** On AI Amplify sign-up
  requires an invite code, so an unused code is a login. For a key,
  `GET /api/admin/invites` leaves out every invite's `code` and `inviteLink`
  (each row says `codeHidden: true`; id, status, dates and who redeemed it
  stay), `GET /api/admin/needs-attention` leaves the `code` out of each
  `unusedInviteCodes` entry (the list and its dates stay, so the count does),
  and `GET /api/admin/organisations` and
  `GET /api/admin/organisations/:id/dashboard` leave out the organisation's
  `joinCode` and `joinLink` (`joinCodeHidden: true`; name, type,
  `joinEnabled` and the counts stay). An admin in the browser still sees them
  all. The `ai.*` analytics views carry no codes.
- Keys are never accepted on Better Auth routes (`/api/auth/*`) or account
  routes (`/api/account/*`), also when the request line is in absolute form
  (`POST http://host/api/account/…`). This means a key can't be used to set a
  password on the service account, edit its profile or mint tokens for it.
- The service account can't sign in or hold a browser session. Password
  sign-in gets the same status and body as a wrong password, code sign-in the
  same status and body as a wrong code, and code requests the same status and
  body as for an unknown address, without sending anything. (Same status and
  body, not a timing guarantee.) A session cookie for it gets a 401.
- That block does not depend on `OPERATOR_SERVICE_USER_EMAIL` alone. It
  applies to the address in that variable **and** to any account named
  "Maya (AI operator)" (the name the create script gives it; case and
  surrounding spaces ignored), so the account still can't sign in if the
  variable is unset, for example after the feature is turned off or on a
  deploy that forgot it. A person who names their own account that way
  locks themselves out; an admin can rename them.
- `Basic` credentials are left alone, so the demo access gate keeps working.
  The gate already exempts `/api/`.

## Allowed routes

This is the contract the potential-ai AI Amplify adapter is built against.
It must list exactly `OPERATOR_ROUTES` in `server/auth/operatorScope.ts` (a
test compares the two). `:param` matches one path segment; matching is
case-insensitive with an optional trailing slash, as Express routes. **When the
adapter adds or changes a tool, add its route here and to `operatorScope.ts` in
the same change, or the tool gets a 403.**

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/api/admin/offers` | All offers with redemption counts |
| `GET` | `/api/offers/:id` | One offer |
| `PATCH` | `/api/admin/offers/:id` | Title, category, image only; any price field or `status` (publish/unpublish) is a 403 |
| `GET` | `/api/admin/announcements` | Past announcements (read only) |
| `GET` | `/api/admin/announcements/audience` | Who an announcement would reach (read only) |
| `POST` | `/api/admin/announcements/:id/archive` | Takes a banner down; sends nothing |
| `GET` | `/api/live-events/admin` | All events |
| `GET` | `/api/live-events/admin/zoom` | Zoom connection status |
| `GET` | `/api/live-events/:id/bookings` | Who booked |
| `GET` | `/api/live-events/:id/bookings/export` | Bookers' names and emails as CSV (audited) |
| `POST` | `/api/live-events/:id/zoom/resync` | Retries Zoom; Zoom's own registrant emails are off |
| `GET` | `/api/lms/admin/courses` | Course authoring |
| `GET` | `/api/lms/admin/courses/:id` | |
| `POST` | `/api/lms/admin/courses` | |
| `PATCH` | `/api/lms/admin/courses/:id` | |
| `DELETE` | `/api/lms/admin/courses/:id` | |
| `POST` | `/api/lms/admin/courses/:id/modules` | |
| `POST` | `/api/lms/admin/courses/:id/modules/reorder` | |
| `POST` | `/api/lms/admin/courses/:id/assessments` | |
| `PATCH` | `/api/lms/admin/modules/:id` | |
| `DELETE` | `/api/lms/admin/modules/:id` | |
| `POST` | `/api/lms/admin/modules/:id/units` | |
| `POST` | `/api/lms/admin/modules/:id/units/reorder` | |
| `PATCH` | `/api/lms/admin/units/:id` | |
| `DELETE` | `/api/lms/admin/units/:id` | |
| `POST` | `/api/lms/admin/units/:id/blocks` | |
| `POST` | `/api/lms/admin/units/:id/blocks/reorder` | |
| `PATCH` | `/api/lms/admin/blocks/:id` | |
| `DELETE` | `/api/lms/admin/blocks/:id` | |
| `POST` | `/api/lms/admin/blocks/:id/questions` | |
| `POST` | `/api/lms/admin/blocks/:id/questions/reorder` | |
| `PATCH` | `/api/lms/admin/block-questions/:id` | |
| `DELETE` | `/api/lms/admin/block-questions/:id` | |
| `PATCH` | `/api/lms/admin/assessments/:id` | |
| `DELETE` | `/api/lms/admin/assessments/:id` | |
| `POST` | `/api/lms/admin/assessments/:id/questions` | |
| `POST` | `/api/lms/admin/assessments/:id/questions/reorder` | |
| `PATCH` | `/api/lms/admin/assessment-questions/:id` | |
| `DELETE` | `/api/lms/admin/assessment-questions/:id` | |
| `GET` | `/api/lms/learning/admin/learners` | Learning journeys |
| `GET` | `/api/lms/cod/admin/learners` | |
| `GET` | `/api/lms/both/admin/learners` | |
| `GET` | `/api/lms/learning/themes` | |
| `POST` | `/api/lms/learning/admin/learners/:userId/reset-progress` | |
| `POST` | `/api/lms/learning/admin/learners/:userId/reset-path` | |
| `POST` | `/api/lms/learning/admin/learners/:userId/regenerate-path` | |
| `POST` | `/api/lms/cod/admin/learners/:userId/reset` | |
| `POST` | `/api/lms/both/admin/learners/:userId/reset` | |
| `POST` | `/api/lms/learning/setup/regenerate` | |
| `POST` | `/api/lms/learning/admin/regenerate-all` | Wipes every learner's path: the adapter should make this an approval tool |
| `GET` | `/api/admin/organisations` | Read only, without join codes or sign-up links |
| `GET` | `/api/admin/organisations/:id/dashboard` | Read only, without the join code or sign-up link |
| `GET` | `/api/admin/organisations/:id/learners/:userId` | Read only |
| `GET` | `/api/admin/organisations/:id/partners` | Read only, without partner setup links |
| `GET` | `/api/admin/needs-attention` | Dashboard counts; unused invites without their codes |
| `GET` | `/api/admin/invites` | Invites (read only), without codes or invite links |
| `GET` | `/api/admin/mentor-applications` | Read only |
| `GET` | `/api/admin/stakeholder-applications` | Read only |
| `GET` | `/api/media` | Media library |
| `DELETE` | `/api/media` | Bulk delete |
| `DELETE` | `/api/media/:id` | |
| `GET` | `/api/admin/ai-reports` | AI safety reports |
| `PATCH` | `/api/admin/ai-reports/:id` | Status and admin note; sends nothing |
| `GET` | `/api/admin/stats` | Analytics |
| `GET` | `/api/admin/analytics/impact` | |
| `GET` | `/api/admin/analytics/learning-gain` | |
| `GET` | `/api/admin/analytics/insights` | |
| `GET` | `/api/admin/analytics/kpi-overview` | |
| `GET` | `/api/admin/analytics/user-growth` | |
| `GET` | `/api/admin/analytics/enrollments` | |
| `GET` | `/api/admin/analytics/course-engagement` | |
| `GET` | `/api/admin/analytics/course-completion` | |
| `GET` | `/api/admin/analytics/course-performance` | |
| `GET` | `/api/admin/analytics/stakeholder-kpis` | |
| `GET` | `/api/admin/analytics/stakeholder-trend` | |
| `GET` | `/api/admin/analytics/stakeholder-trend-by-type` | |
| `GET` | `/api/admin/ai/catalog` | AI analytics: pseudonymised `ai.*` views |
| `POST` | `/api/admin/ai/query` | SELECT-only, guarded server-side |
| `GET` | `/api/admin/ai/dashboards` | Saved boards |
| `GET` | `/api/admin/ai/dashboards/:id` | |
| `POST` | `/api/admin/ai/dashboards` | |
| `PUT` | `/api/admin/ai/dashboards/:id` | |
| `DELETE` | `/api/admin/ai/dashboards/:id` | |

Compared with SMEEP's list: no competitions (AI Amplify has none); offer
create and delete, announcement send, live event create/edit/delete, invite
code create and every organisation write are gone (below).

## Deliberately excluded routes

Each answers **403** for a key and works as before for an admin session (the
tests check both sides). It must list exactly `OPERATOR_EXCLUDED_ROUTES` in
`server/auth/operatorScope.ts` (a test compares the two). Do not add any of
these to the allowlist without the client's and the CEO's say-so.

**Sends to learners** (learner messages stay off until the client signs off;
the scope does not open when `LEARNER_NOTIFICATIONS_ENABLED` is switched on):

| Method | Path | Why |
| --- | --- | --- |
| `POST` | `/api/admin/announcements` | Sends a banner, bell notification and email to a whole audience |
| `POST` | `/api/live-events` | A published event notifies every learner (bell) |
| `PATCH` | `/api/live-events/:id` | A new time notifies everyone booked; publishing or adding a replay notifies every learner |
| `DELETE` | `/api/live-events/:id` | A cancellation notifies everyone booked |
| `POST` | `/api/admin/organisations/:id/learners` | Adding learners tells each of them in the bell |

**Prices and payment records** (Maya never changes prices or puts an offer on
or off sale; see also the price and status check on
`PATCH /api/admin/offers/:id` above):

| Method | Path | Why |
| --- | --- | --- |
| `POST` | `/api/admin/offers` | An offer can't be created without setting its price |
| `DELETE` | `/api/admin/offers/:id` | Deletes the offer's redemptions (order and payment records) with it |

The learner checkout routes (`POST /api/offers/:id/payment-intent`,
`POST /api/offers/:id/complete`) are learner-only and out of scope too. There
are no refund or Stripe configuration routes in the API.

**Invite codes and organisations** (Maya asks her Lead for these; reading them
stays open):

| Method | Path | Why |
| --- | --- | --- |
| `POST` | `/api/admin/invites` | Creates an invite code (programme access) |
| `POST` | `/api/admin/organisations` | Creates an organisation |
| `PATCH` | `/api/admin/organisations/:id` | Renames an organisation or turns its sign-up link on or off |
| `DELETE` | `/api/admin/organisations/:id` | Archives an organisation |
| `POST` | `/api/admin/organisations/:id/join-code` | Issues a new organisation sign-up link |
| `DELETE` | `/api/admin/organisations/:id/learners/:userId` | Changes organisation membership |
| `DELETE` | `/api/admin/organisations/:id/partners/:userId` | Changes organisation membership |
| `DELETE` | `/api/admin/organisations/:id/invites/:inviteId` | Changes a partner invite |

**Hands out a login** (as on SMEEP: the key would choose who gets it):

| Method | Path | Why |
| --- | --- | --- |
| `POST` | `/api/admin/organisations/:id/partners` | Emails a partner setup link to any address the caller names |
| `POST` | `/api/admin/mentor-applications/:id/approve` | Creates a mentor login and emails its setup link |
| `POST` | `/api/admin/mentor-applications/:id/reject` | The other half of the approval decision |

**Bulk data, generation, uploads, host links** (as on SMEEP):

| Method | Path | Why |
| --- | --- | --- |
| `GET` | `/api/admin/exports/:dataset` | Bulk export of learner data |
| `GET` | `/api/admin/organisations/:id/exports/:dataset` | Bulk export of an organisation's learner data |
| `POST` | `/api/admin/ai/report` | AI report download (bulk export) |
| `POST` | `/api/lms/admin/quiz/generate` | AI generation (cost) |
| `POST` | `/api/media/upload` | File upload |
| `GET` | `/api/live-events/:id/zoom/start-url` | The Zoom host link starts the meeting as host |

Everything else that is not in the allowed table is also a 403 for a key:
every learner, mentor, partner and public route (`/api/me/*`, `/api/lms/…`
learner routes, `/api/ai/*`, `/api/ai-tools/*`, `/api/newsletter/*`,
`/api/partner/*`, …), and `/api/account/*` and `/api/auth/*` are never a
sign-in for a key at all (401 / no session).

## What gets audited

One row each, written after the response, never blocking or failing the
request:

- Every `POST`/`PUT`/`PATCH`/`DELETE` to any `/api` route by an admin session
  or an operator key, including failed and refused ones (the status code is
  kept, so a key's refused attempt on an excluded route, a price field or an
  offer's status shows up as a 403 row with what it sent). If the caller hangs up before the
  response, the row has status `499`; it is written as soon as the caller is
  identified, even if they hung up while that was still happening (the change
  may still go through). This holds for every request on the connection,
  including requests pipelined behind one another (the hang-up is watched on
  the connection, not on each response, since Node never attaches the queued
  responses to the socket).
- `GET` requests made with an operator key that download a bulk export: a path
  containing `/export` or `/exports`, or a response sent as an attachment.
  Other `GET`s are not recorded.

Each row holds `actor_user_id`, `actor_kind` (`session` | `operator_key`),
`key_label`, `method`, `path` (normalised: no query string, no host),
`status_code`, `target_ids` (the route params, e.g. `{"id": "…"}`),
`request_summary` and `ip`. `request_summary` is `{ query?, body? }`.
Password (incl. `confirm`, `pwd`, `…Pass`), token, secret, key, OTP, PIN,
`…code`, cookie and authorization fields are replaced with `[redacted]` at any
depth, and so are TOTP, MFA, recovery and backup codes, JWT, bearer, HMAC,
`sig` and signature, private and signing key, CVV, card number and IBAN fields
(field names matched case-insensitively). On `/api/account/*`, `/api/auth/*`,
AI-mentor chat (`/api/ai-mentors/*`), Ask Sana (`/api/ask-sana/*`), Anna the
tutor and the examiner (`/api/ai/*`), the PDF emailer (`/api/ai-tools/*`) and
AI answer reports (`/api/ai-reports`) only the field names are kept:
`{ queryKeys?, bodyKeys? }`. Emails are kept. Long strings, long arrays and
very large bodies are cut short. `actor_user_id` has no foreign key, so
deleting a user keeps the record of what they did.

## Setup: staging first, then production

Deploy the branch first. Migration `0041_admin_audit_log` runs on its own when
the server container starts (`entrypoint.sh` runs `scripts/migrate.mjs`). From
then on, admin changes are audited even before any key exists. Until both
variables are set, Bearer headers are ignored and nothing else changes.

### 1. The service-account address

`maya@potential.org`. The account can't sign in anyway, and the script refuses
to take over an existing account: if `maya@potential.org` already has an AI
Amplify account (as a learner, or a person who signs in), stop and pick a
different address with the Lead.

### 2. Generate a key (on your own machine)

```sh
cd server
node scripts/generate-operator-key.mjs --label maya-amplify-staging-2026-11
```

The script prints two things:

- **The raw key** (`amplify_op_…`), shown once. Put it straight into Maya's
  secret store and nowhere else: not chat, not tickets, not the server.
- **The `label:sha256` entry**, which goes in `OPERATOR_API_KEYS`.

Use a different key for each environment, for example
`maya-amplify-staging-…` and `maya-amplify-prod-…`. The script refuses to
print into a pipe or log file.

### 3. Create the service account (Dokploy terminal, server container, `/app`)

```sh
node scripts/create-operator-user.mjs --email maya@potential.org          # preview
node scripts/create-operator-user.mjs --email maya@potential.org --apply
```

The account is created as an admin named "Maya (AI operator)", with no
password and no other way to sign in. Running the script again changes nothing.

### 4. Set the environment and redeploy

On the server service in Dokploy, set:

```
OPERATOR_SERVICE_USER_EMAIL=maya@potential.org
OPERATOR_API_KEYS=maya-amplify-staging-2026-11:<sha256 from step 2>
```

Both compose files already pass these variables through. Redeploy, or restart
the server, so it reads them. Leave `LEARNER_NOTIFICATIONS_ENABLED` as it is:
the key's scope does not depend on it.

### 5. Verify

Run these from a machine that has the key. The key is read from an environment
variable so it stays out of your shell history:

```sh
read -rs AMPLIFY_OPERATOR_KEY && export AMPLIFY_OPERATOR_KEY   # paste the key, press Enter
curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $AMPLIFY_OPERATOR_KEY" https://<site>/api/admin/invites            # 200
curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer wrong" https://<site>/api/admin/invites                          # 401
curl -s -o /dev/null -w '%{http_code}\n' -X POST -H "Authorization: Bearer $AMPLIFY_OPERATOR_KEY" https://<site>/api/admin/invites  # 403
```

To confirm the codes are hidden, `curl -s -H "Authorization: Bearer
$AMPLIFY_OPERATOR_KEY" https://<site>/api/admin/invites | grep -c AMPLIFY-`
should print `0` (the same list in the admin UI shows the codes).

The first call returning 200 also proves that the site's `/api` proxy passes
the `Authorization` header through. The third proves the scope is live (the
403 comes before anything is created). Next, make one harmless change with the
key (for example save and delete an AI analytics board) and check that it was
recorded:

```sql
select at, actor_kind, key_label, method, path, status_code, target_ids
from admin_audit_log order by at desc limit 20;
```

When staging looks right, repeat steps 2 to 5 on production with a **new**
production key.

## Rotation (no downtime)

1. Generate a new key with a new label, for example `maya-amplify-prod-2027-02`.
2. Add its entry next to the old one:
   `OPERATOR_API_KEYS=maya-amplify-prod-2026-11:<old>,maya-amplify-prod-2027-02:<new>`.
   Then redeploy.
3. Switch Maya to the new key. Check that `admin_audit_log.key_label` shows the
   new label.
4. Remove the old entry and redeploy.

## Revocation

- **One key:** remove its entry from `OPERATOR_API_KEYS` and redeploy.
- **All keys, immediately, without a redeploy:** demote the service account.
  Every key gets a 401 from the next request on:
  ```sql
  update users set role = 'operator-disabled' where email = 'maya@potential.org';
  ```
  Set the role back to `admin` to re-enable it.
- **Turn the feature off (retire it):** demote the service account first,
  then unset `OPERATOR_API_KEYS` and redeploy. Bearer headers are then
  ignored. Demoting matters even with the keys gone: the account stays an
  admin otherwise, and the only thing between it and a sign-in would be the
  sign-in block above. Keep its name as "Maya (AI operator)" so that block
  still applies with `OPERATOR_SERVICE_USER_EMAIL` unset, or delete the
  account (audit rows keep its id; they have no foreign key).

If a key may have leaked, demote the account first (it's instant), then rotate.
Then review `admin_audit_log` for that `key_label`.

## Notes

- A key acts as an admin on the allowlisted routes, which include
  destructive ones (deleting courses and media, wiping learners' paths). Treat
  it like an admin password that never expires.
- The service account is an admin, so it gets the in-app alerts admins get
  (for example "AI answer reported"). It never receives email: it can't sign
  in, and nothing emails admins by role.
- Audit rows are kept indefinitely; there is no retention job yet (a policy
  decision).
- Failed key attempts are logged, as `[operator-keys] refused a Bearer
  request` with a reason. The key itself is never logged.
- Operator requests count against the same per-IP rate limits as any visitor
  (`/api`: 1200 a minute). SMEEP's extra announcement limit for keys is not
  ported: sending an announcement is out of a key's scope here.
- There is no admin page for the audit log yet. Read it with SQL.
