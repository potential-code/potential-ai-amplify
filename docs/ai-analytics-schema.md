# AI analytics — the `ai` schema and API

What the admin AI analytics features (AI Insights chat + reports, AI Dashboard
boards) can query, and how. Ported from Sama's AI Insights
(`Sama-Vision-Guide@ai-insights-rework`) and VX Academy's dashboard builder.

Sources of truth:

- `server/db/aiViews/001_ai_schema.sql` — the views (columns and types)
- `server/services/ai-sql/schema-catalog.ts` — what the agents are told (the `sql-1.2.0` catalogue)
- `server/services/ai-sql/guard.ts`, `execute.ts`, `limits.ts` — what SQL is accepted and how it runs
- `server/db/aiViews/000_role.sql.example` — the optional read-only role

## Overview

`ai` is a Postgres schema of **plain views** over AI Amplify's tables (Sama uses
materialised views; AI Amplify's data is small enough to read live, so there is no
refresh job). It is built at server start whenever it is missing or
`001_ai_schema.sql` changed (the schema comment carries the file's sha256), and
by hand with `bun run db:ai-views` from `server/`.

**Pseudonymised, not anonymised.** A person is reduced to the platform's own
`users.id` uuid — `learner_id` / `mentor_id` — plus category labels, which is
Sama's convention. An administrator can map that id back to a person, so treat
rows as pseudonymous data. Never exposed: names, emails, phones, bios, company,
avatar/cover/image URLs, meeting/recording/LinkedIn links, mentor notes, AI
Examiner scenarios/transcripts/feedback, quiz and assessment answers, billing
fields and Stripe ids, certificate numbers/URLs/file paths, stakeholder contact
details, tokens, password hashes, anything from `auth_*`. Learner-keyed views
contain `users.role = 'sme'` only. `server/tests/ai-schema.test.ts` checks the
live column names against a PII pattern list and scans every text value for
emails, phone numbers, links and real names.

## Running generated SQL

Every statement goes through `validateSql` (pgsql-ast-parser): exactly one
`SELECT`/`WITH`/`UNION`/`VALUES`; only catalogued `ai` views (unqualified or
`ai.<view>`) and the query's own CTEs; no `pg_*`, `lo_*`, `dblink*`, `has_*`,
`*_to_xml*`, `xpath*`, `txid_*`, `inet_*`, `to_reg*`, `ts_stat`/`ts_rewrite`
(they run SQL given as text), `set_config`/`current_setting`, sequence or
introspection functions; no function qualified with a schema other than `ai` /
`pg_catalog`; no `reg*` casts, `FOR UPDATE`, `SELECT … INTO`; must read at
least one view.

It then runs in `BEGIN READ ONLY` with `SET LOCAL statement_timeout = 15000`
and `SET LOCAL search_path = ai`, wrapped as `SELECT * FROM (<sql>) LIMIT 501`
(500 rows returned; `truncated` says whether more existed), at most 4 at once.

| Mode | When | Boundary |
|---|---|---|
| Main pool (default) | `AI_READONLY_DATABASE_URL` unset | Guard + read-only transaction + timeout. Writes are impossible; the guard is what keeps reads on `ai.*`. |
| Dedicated role (recommended in production) | `AI_READONLY_DATABASE_URL` = a `amplify_ai_readonly` connection | The role can only `SELECT` the `ai` views (plain views run with their owner's rights). Checked per process: if the role can read `users`, is superuser, bypasses RLS or can create in `ai`, every query is refused (503 `AI_READONLY_ROLE_UNSAFE`). |

## Views

| View | Grain | Columns |
|---|---|---|
| `learner` | learner | learner_id, country, signed_up_on, signup_month, last_active_on, verified, signed_up_with_invite, points |
| `course` | course (drafts too) | course_id, title, category, difficulty, status, certificate_enabled, created_on, module_count, unit_count, lesson_count |
| `course_progress` | learner × course enrolled/started | learner_id, course_id, enrolled, enrollment_status, enrolled_on, started_on, progress_pct, completed_modules, total_modules, completed, completed_on |
| `lesson_progress` | learner × AI Amplify lesson (block) touched | learner_id, lesson_id, lesson_type, unit_id, module_id, course_id, status, video_watch_pct, completed_on |
| `lesson_completion` | completed step, all stacks | learner_id, source, journey_id, completed_on |
| `course_assessment_attempt` | submitted pre/post assessment | attempt_id, learner_id, course_id, assessment_type, is_graded, passing_score, attempt_number, score_pct, passed, completed_on |
| `certificate` | certificate issued | certificate_id, learner_id, course_id, status, issued_on |
| `journey` | journey started (Learning Path / Content on Demand / Blended / Tokenando) | journey_id, learner_id, journey_type, status, started_on, milestone_count |
| `journey_item_progress` | learner × COD/Blended item touched | learner_id, journey_id, journey_type, item_kind, status, video_watch_pct, completed_on |
| `journey_quiz_result` | milestone pretest/posttest | learner_id, journey_id, journey_type, quiz_type, questions_correct, total_questions, score_pct, passed, attempt_number, completed_on |
| `activity_day` | learner × active day | learner_id, active_on, steps |
| `mentor` | mentor | mentor_id, country, joined_on, expertise, featured, upcoming_open_slots |
| `mentor_expertise` | mentor × expertise area | mentor_id, expertise |
| `mentor_application` | mentor application | application_id, status, applied_on, expertise, has_mentor_account |
| `mentor_session` | booked session | session_id, mentor_id, learner_id, status, booked_on, starts_at, duration_minutes, cancelled_by, cancelled_on, mentor_expertise |
| `live_event` | live event (drafts too) | event_id, title, event_type, event_on, status, has_recording, created_on |
| `offer` | partner offer | offer_id, title, category, status, price_usd, points_cost, is_free, created_on |
| `offer_redemption` | redemption | redemption_id, learner_id, offer_id, points_spent, amount_usd, order_status, redeemed_on |
| `stakeholder_registration_month` | stakeholder type × month | stakeholder_type, registration_month, registrations |

Business rules baked in: countries fold ISO codes and aliases into the
`countries-list` names the sign-up pickers use (`ai.country_name()`); a course
is completed when progress reaches 100% (enrollment status never moves);
internal Blended items are counted once, as AI Amplify lessons; mentor expertise
drops the `featured` display tag and folds case variants.

## API (`/api/admin/ai`, admin only, 120 requests / 5 min per admin)

| Route | Body | Response `data` |
|---|---|---|
| `GET /catalog` | — | the `sql-1.2.0` catalogue (`version, dialect, schema, refreshedAt, views[], enums, notes[], instructions[], limits, chartTypes[], chartDescriptors[]`) |
| `POST /query` | `{ sql }` | `{ columns, columnTypes, rows, rowCount, truncated, elapsedMs }` |
| `POST /report` (`?format=pdf\|xlsx`) | `ReportSpec` | file: `ai-amplify-report-YYYY-MM-DD.pdf` / `.xlsx` |
| `GET /dashboards` | — | `Board[]`, newest first |
| `POST /dashboards` | `{ title, charts: ChartSpec[] }` | `Board` (201) |
| `GET /dashboards/:id` | — | `Board` |
| `PUT /dashboards/:id` | `{ title, charts }` (replaces) | `Board` |
| `DELETE /dashboards/:id` | — | `{ deleted: true }` |

Query errors: guard rejection → 400 `SQL_REJECTED`, Postgres error → 400
`SQL_FAILED`, timeout → 400 `SQL_TIMEOUT`; the body is
`{ success: false, error: { message, code, errors: string[] } }` and `errors`
is the agent's correction signal. Body validation failures are 422.

A client loads the catalogue from `GET /api/admin/ai/catalog` and passes it to
potential-ai as the CopilotKit context entry `__catalog__` (or
`configurable.catalog`); both graphs validate it against
`potential-ai/src/graphs/shared/sqlCatalog.ts`.
