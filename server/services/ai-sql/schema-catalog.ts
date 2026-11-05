/**
 * The only description of AI Amplify's `ai` schema the AI agents ever see.
 *
 * Shape ported from Sama's AI Insights catalogue (contract `sql-1.x`, see
 * potential-ai src/graphs/shared/sqlCatalog.ts); the prose is AI Amplify's own,
 * transcribed from the services the views mirror. It carries view names,
 * column names, types and business meaning — no data and no reference to a
 * real table. One catalogue serves both potential-ai graphs: `dataChat` (AI
 * Insights) ignores the charting fields and `dashboardBuilder` (AI Dashboard)
 * reads them, which is exactly what contract sql-1.2.0 describes.
 *
 * `notes` annotate the DATA; `instructions` are rules about BEHAVIOUR.
 */

import { sql as dsql } from "drizzle-orm";
import { db } from "../../db";
import {
  assessmentTypeEnum,
  blockProgressStatusEnum,
  blockTypeEnum,
  bothPathStatusEnum,
  certificateStatusEnum,
  codQuizTypeEnum,
  COURSE_TOPICS,
  courseStatusEnum,
  difficultyEnum,
  enrollmentStatusEnum,
  learningPathStatusEnum,
  liveEventStatusEnum,
} from "../../db/schema";
import { AI_SQL_CHART_TYPES, CHART_DESCRIPTORS, type ChartDescriptor } from "./chart-spec";
import { AI_STATEMENT_TIMEOUT_MS, MAX_QUERIES_PER_TURN, MAX_ROWS } from "./limits";

/**
 * Bump the major only when a view or column is removed or renamed — the
 * agents gate on the major. 1.2.0 is the contract that adds the optional
 * `chartTypes[]` / `chartDescriptors[]`.
 */
export const SQL_CATALOG_VERSION = "sql-1.2.0";

export interface CatalogColumn {
  name: string;
  type: string;
  description: string;
}

export interface CatalogView {
  name: string;
  grain: string;
  description: string;
  columns: CatalogColumn[];
}

export interface SqlCatalog {
  version: string;
  dialect: "postgresql";
  /** The one schema the catalogue's views live in: "ai" here, "eco" for the ecosystem statistics. */
  schema: string;
  refreshedAt: string | null;
  views: CatalogView[];
  enums: Record<string, string[]>;
  notes: string[];
  instructions: string[];
  limits: {
    maxRows: number;
    statementTimeoutMs: number;
    maxQueriesPerTurn: number;
  };
  chartTypes: string[];
  chartDescriptors: ChartDescriptor[];
}

/* ------------------------------------------------------------------ */
/* Enums — imported from the schema where one exists, never retyped    */
/* ------------------------------------------------------------------ */

const JOURNEY_TYPES = ["learning_path", "content_on_demand", "blended_learning"];

const ENUMS: Record<string, string[]> = {
  course_category: [...COURSE_TOPICS],
  course_difficulty: [...difficultyEnum.enumValues],
  course_status: [...courseStatusEnum.enumValues],
  enrollment_status: [...enrollmentStatusEnum.enumValues],
  progress_status: [...blockProgressStatusEnum.enumValues],
  lesson_type: [...blockTypeEnum.enumValues],
  assessment_type: [...assessmentTypeEnum.enumValues],
  certificate_status: [...certificateStatusEnum.enumValues],
  journey_type: JOURNEY_TYPES,
  journey_status_learning_path: [...learningPathStatusEnum.enumValues],
  journey_status_other: [...bothPathStatusEnum.enumValues],
  lesson_completion_source: ["course_lesson", "content_on_demand", "blended_learning"],
  journey_item_kind: ["youtube", "article", "course_lesson", "external"],
  quiz_type: [...codQuizTypeEnum.enumValues],
  mentor_session_status: ["confirmed", "cancelled", "completed"],
  mentor_session_cancelled_by: ["mentor", "sme"],
  mentor_application_status: ["pending", "approved", "rejected"],
  live_event_status: [...liveEventStatusEnum.enumValues],
  offer_category: ["AI", "Marketing", "IT", "Finance", "PR", "Ecommerce", "Training"],
  offer_status: ["published", "draft"],
  order_status: ["paid", "free"],
  stakeholder_type: ["vc", "government", "corporate", "university", "incubator"],
};

/* ------------------------------------------------------------------ */
/* Views                                                                */
/* ------------------------------------------------------------------ */

const ID = (what: string, joins: string) => `Opaque id of the ${what}. Join key to ${joins}.`;
const LEARNER_ID = { name: "learner_id", type: "uuid", description: ID("learner", "ai.learner.learner_id") };
const COURSE_ID = { name: "course_id", type: "uuid", description: ID("course", "ai.course.course_id") };

const VIEWS: CatalogView[] = [
  {
    name: "learner",
    grain: "one row per learner",
    description:
      "Every AI Amplify learner — a small-business owner or employee with an SME account (users.role = 'sme'). " +
      "Mentors and administrators never appear here or in any other learner-keyed view. This is the population " +
      "the admin dashboard's 'Learners' figure counts.",
    columns: [
      { ...LEARNER_ID, description: "Opaque id (the platform's user id). Join key to every learner-keyed view." },
      { name: "country", type: "text", description: "Country of residence as an English name ('United Arab Emirates', 'Nigeria'). ISO codes and aliases from early sign-ups are already folded into names. NULL if never given." },
      { name: "signed_up_on", type: "date", description: "Account creation date." },
      { name: "signup_month", type: "date", description: "First day of the sign-up month — group by this for 'sign-ups per month'." },
      { name: "last_active_on", type: "date", description: "Date of the learner's last authenticated request to AI Amplify (any page). NULL if never since this was tracked." },
      { name: "verified", type: "boolean", description: "Email address verified." },
      { name: "signed_up_with_invite", type: "boolean", description: "Signed up with an invite code." },
      { name: "points", type: "integer", description: "Current points balance (earned through course work, spent on partner offers)." },
    ],
  },
  {
    name: "course",
    grain: "one row per course",
    description:
      "The AI Amplify course library, drafts included — filter status = 'published' for what learners can see. " +
      "A course is modules → units → lessons; a 'lesson' is one learning block (text, video, image, question or simulation).",
    columns: [
      { ...COURSE_ID, description: "Opaque id. Join key to every course-keyed view." },
      { name: "title", type: "text", description: "Course title." },
      { name: "category", type: "text", description: "Course topic — see the course_category enum. NULL = uncategorised." },
      { name: "difficulty", type: "text", description: "See the course_difficulty enum." },
      { name: "status", type: "text", description: "See the course_status enum." },
      { name: "certificate_enabled", type: "boolean", description: "Whether finishing the course issues a certificate." },
      { name: "created_on", type: "date", description: "" },
      { name: "module_count", type: "integer", description: "" },
      { name: "unit_count", type: "integer", description: "" },
      { name: "lesson_count", type: "integer", description: "Number of lessons (learning blocks) in the course." },
    ],
  },
  {
    name: "course_progress",
    grain: "one row per learner per course they enrolled in or started",
    description:
      "Course enrollment and progress. A course is COMPLETED when progress reaches 100% (completed = true); " +
      "enrollment_status never moves to 'completed' in the app today, so never use it to count completions.",
    columns: [
      LEARNER_ID,
      COURSE_ID,
      { name: "enrolled", type: "boolean", description: "Has an enrollment row (almost always true)." },
      { name: "enrollment_status", type: "text", description: "See the enrollment_status enum. In practice 'active'." },
      { name: "enrolled_on", type: "date", description: "" },
      { name: "started_on", type: "date", description: "First lesson progress in the course. NULL if enrolled but never started." },
      { name: "progress_pct", type: "integer", description: "0–100, share of the course's lessons completed." },
      { name: "completed_modules", type: "integer", description: "" },
      { name: "total_modules", type: "integer", description: "" },
      { name: "completed", type: "boolean", description: "Course finished (progress reached 100%). The figure 'courses completed' counts these rows." },
      { name: "completed_on", type: "date", description: "When progress last reached 100% (re-finishing a lesson later moves it). NULL unless completed." },
    ],
  },
  {
    name: "lesson_progress",
    grain: "one row per learner per AI Amplify lesson they opened or finished",
    description:
      "Progress on AI Amplify's own lessons (learning blocks), wherever the learner did them: the course player, a Learning Path, " +
      "Multi Learning, or an internal item of a Blended path (mirrored here by the app).",
    columns: [
      LEARNER_ID,
      { name: "lesson_id", type: "uuid", description: "Opaque id of the lesson (learning block)." },
      { name: "lesson_type", type: "text", description: "See the lesson_type enum." },
      { name: "unit_id", type: "uuid", description: "" },
      { name: "module_id", type: "uuid", description: "" },
      COURSE_ID,
      { name: "status", type: "text", description: "See the progress_status enum." },
      { name: "video_watch_pct", type: "integer or NULL", description: "Video lessons only." },
      { name: "completed_on", type: "date", description: "NULL unless status = 'completed'." },
    ],
  },
  {
    name: "lesson_completion",
    grain: "one row per completed learning step",
    description:
      "Every completed learning step across all three learning stacks — the admin dashboard's 'lessons completed'. " +
      "Use this for 'lessons completed per month' and any all-journeys activity count; use the per-stack views for detail.",
    columns: [
      LEARNER_ID,
      { name: "source", type: "text", description: "See the lesson_completion_source enum. 'course_lesson' = a AI Amplify lesson on any surface (course player, Learning Path, Multi Learning, internal Blended item)." },
      { name: "journey_id", type: "uuid or NULL", description: "The Content on Demand / Blended journey, joins to ai.journey.journey_id. NULL for course_lesson." },
      { name: "completed_on", type: "date", description: "" },
    ],
  },
  {
    name: "course_assessment_attempt",
    grain: "one row per submitted course assessment attempt",
    description:
      "Course pre-assessments (before the course, a baseline) and post-assessments (the final exam). Scores only, never answers. " +
      "Knowledge gain is the post score minus the pre score for the same learner and course.",
    columns: [
      { name: "attempt_id", type: "uuid", description: "" },
      LEARNER_ID,
      COURSE_ID,
      { name: "assessment_type", type: "text", description: "See the assessment_type enum: 'pre' or 'post' (final exam)." },
      { name: "is_graded", type: "boolean", description: "Graded assessments have a pass mark; ungraded ones have passed = NULL." },
      { name: "passing_score", type: "integer", description: "Pass mark, 0–100." },
      { name: "attempt_number", type: "integer", description: "1 for the first attempt." },
      { name: "score_pct", type: "integer", description: "0–100, share of questions answered correctly." },
      { name: "passed", type: "boolean or NULL", description: "NULL when ungraded." },
      { name: "completed_on", type: "date", description: "" },
    ],
  },
  {
    name: "certificate",
    grain: "one row per course certificate issued",
    description: "Certificates issued for finishing a course with certificates enabled.",
    columns: [
      { name: "certificate_id", type: "uuid", description: "" },
      LEARNER_ID,
      COURSE_ID,
      { name: "status", type: "text", description: "See the certificate_status enum." },
      { name: "issued_on", type: "date", description: "" },
    ],
  },
  {
    name: "journey",
    grain: "one row per personalised learning journey a learner started",
    description:
      "AI Amplify's AI-built learning journeys. journey_type: 'learning_path' (personalised path of AI Amplify lessons), " +
      "'content_on_demand' (curated external videos and articles), 'blended_learning' (AI Amplify lessons plus external content). " +
      "Rebuilding a Learning Path archives the old row " +
      "and adds a new one, so a learner can have several rows — count DISTINCT learner_id for 'learners who started a journey'.",
    columns: [
      { name: "journey_id", type: "uuid", description: "Opaque id of the journey." },
      LEARNER_ID,
      { name: "journey_type", type: "text", description: "See the journey_type enum." },
      { name: "status", type: "text", description: "learning_path: see journey_status_learning_path ('archived' = replaced by a rebuilt path). Others: see journey_status_other ('building' = still being generated, 'failed' = generation failed, 'completed' = every milestone done)." },
      { name: "started_on", type: "date", description: "" },
      { name: "milestone_count", type: "integer", description: "Milestones (stages) on the journey." },
    ],
  },
  {
    name: "journey_item_progress",
    grain: "one row per learner per journey item they opened or finished",
    description:
      "Item-level progress on Content on Demand and Blended journeys. (Learning Path progress is lesson progress — see ai.lesson_progress.)",
    columns: [
      LEARNER_ID,
      { name: "journey_id", type: "uuid", description: "Joins to ai.journey.journey_id." },
      { name: "journey_type", type: "text", description: "See the journey_type enum (never 'learning_path' here)." },
      { name: "item_kind", type: "text", description: "See the journey_item_kind enum: an external 'youtube' video or 'article', or a 'course_lesson' inside a Blended path." },
      { name: "status", type: "text", description: "See the progress_status enum." },
      { name: "video_watch_pct", type: "integer or NULL", description: "" },
      { name: "completed_on", type: "date", description: "NULL unless status = 'completed'." },
    ],
  },
  {
    name: "journey_quiz_result",
    grain: "one row per milestone quiz a learner submitted",
    description:
      "Pretests (diagnostic, before a milestone) and posttests (after it) on Content on Demand and Blended journeys. " +
      "Pass mark is 70%. Pretests never block progress. Scores only, never answers.",
    columns: [
      LEARNER_ID,
      { name: "journey_id", type: "uuid", description: "Joins to ai.journey.journey_id." },
      { name: "journey_type", type: "text", description: "See the journey_type enum." },
      { name: "quiz_type", type: "text", description: "See the quiz_type enum." },
      { name: "questions_correct", type: "integer", description: "Questions answered correctly." },
      { name: "total_questions", type: "integer", description: "" },
      { name: "score_pct", type: "integer", description: "0–100." },
      { name: "passed", type: "boolean", description: "" },
      { name: "attempt_number", type: "integer", description: "" },
      { name: "completed_on", type: "date", description: "" },
    ],
  },
  {
    name: "activity_day",
    grain: "one row per learner per day with at least one learning step",
    description:
      "The learning-streak table: a day counts when the learner completed at least one step anywhere (lesson, journey item, quiz, assessment, simulation). " +
      "'Active learners' in a period = COUNT(DISTINCT learner_id) over these days — this is the dashboard's 'active learners'.",
    columns: [
      LEARNER_ID,
      { name: "active_on", type: "date", description: "The day, in the learner's own time zone." },
      { name: "steps", type: "integer", description: "Learning steps completed that day." },
    ],
  },
  {
    name: "mentor",
    grain: "one row per mentor",
    description: "Human mentors (accounts with the mentor role). No names or contact details.",
    columns: [
      { name: "mentor_id", type: "uuid", description: "Opaque id. Joins to ai.mentor_session.mentor_id and ai.mentor_expertise.mentor_id." },
      { name: "country", type: "text", description: "English country name, or NULL." },
      { name: "joined_on", type: "date", description: "" },
      { name: "expertise", type: "text", description: "Comma-separated expertise areas, as typed on the application. Group by ai.mentor_expertise instead." },
      { name: "featured", type: "boolean", description: "Shown under 'Featured mentors' to learners." },
      { name: "upcoming_open_slots", type: "integer", description: "Bookable future availability slots right now. 0 = not currently bookable." },
    ],
  },
  {
    name: "mentor_expertise",
    grain: "one row per mentor per expertise area",
    description: "Long form of ai.mentor.expertise, for grouping. Spellings that differ only in case are folded together.",
    columns: [
      { name: "mentor_id", type: "uuid", description: "" },
      { name: "expertise", type: "text", description: "One expertise area, e.g. 'Strategy', 'Sales', 'Marketing'." },
    ],
  },
  {
    name: "mentor_application",
    grain: "one row per mentor application",
    description: "Applications to become a AI Amplify mentor, reviewed by admins. No names or contact details.",
    columns: [
      { name: "application_id", type: "uuid", description: "" },
      { name: "status", type: "text", description: "See the mentor_application_status enum." },
      { name: "applied_on", type: "date", description: "" },
      { name: "expertise", type: "text", description: "Comma-separated expertise areas." },
      { name: "has_mentor_account", type: "boolean", description: "An approved application whose mentor has set up an account." },
    ],
  },
  {
    name: "mentor_session",
    grain: "one row per mentoring session booked by a learner",
    description: "One-to-one sessions learners book with human mentors. No meeting links or notes.",
    columns: [
      { name: "session_id", type: "uuid", description: "" },
      { name: "mentor_id", type: "uuid", description: "Joins to ai.mentor.mentor_id." },
      LEARNER_ID,
      { name: "status", type: "text", description: "See the mentor_session_status enum. 'confirmed' = booked (upcoming, or past and not yet marked done); 'completed' = the mentor marked it held." },
      { name: "booked_on", type: "date", description: "When the learner booked." },
      { name: "starts_at", type: "timestamp", description: "Session start (server time, no time zone)." },
      { name: "duration_minutes", type: "integer", description: "" },
      { name: "cancelled_by", type: "text or NULL", description: "See the mentor_session_cancelled_by enum." },
      { name: "cancelled_on", type: "date or NULL", description: "" },
      { name: "mentor_expertise", type: "text", description: "The mentor's expertise areas, comma-separated." },
    ],
  },
  {
    name: "live_event",
    grain: "one row per live event",
    description: "Webinars and workshops, drafts included — filter status = 'published' for what learners see. No links or descriptions.",
    columns: [
      { name: "event_id", type: "uuid", description: "" },
      { name: "title", type: "text", description: "" },
      { name: "event_type", type: "text", description: "Free-text label, usually 'Webinar' or 'Workshop'." },
      { name: "event_on", type: "date or NULL", description: "The event's date. Upcoming = event_on >= current_date." },
      { name: "status", type: "text", description: "See the live_event_status enum." },
      { name: "has_recording", type: "boolean", description: "A recording is available." },
      { name: "created_on", type: "date", description: "" },
    ],
  },
  {
    name: "offer",
    grain: "one row per partner offer",
    description: "The partner-offers marketplace: services learners redeem with points (and, for paid offers, money).",
    columns: [
      { name: "offer_id", type: "uuid", description: "Joins to ai.offer_redemption.offer_id." },
      { name: "title", type: "text", description: "" },
      { name: "category", type: "text", description: "See the offer_category enum." },
      { name: "status", type: "text", description: "See the offer_status enum." },
      { name: "price_usd", type: "numeric", description: "List price in US dollars; 0 = free." },
      { name: "points_cost", type: "integer", description: "Points needed to redeem." },
      { name: "is_free", type: "boolean", description: "" },
      { name: "created_on", type: "date", description: "" },
    ],
  },
  {
    name: "offer_redemption",
    grain: "one row per offer redeemed by a learner",
    description: "Offer redemptions. No billing details.",
    columns: [
      { name: "redemption_id", type: "uuid", description: "" },
      LEARNER_ID,
      { name: "offer_id", type: "uuid", description: "Joins to ai.offer.offer_id." },
      { name: "points_spent", type: "integer", description: "" },
      { name: "amount_usd", type: "numeric", description: "Amount charged in US dollars; 0 for free orders." },
      { name: "order_status", type: "text", description: "See the order_status enum." },
      { name: "redeemed_on", type: "date", description: "" },
    ],
  },
  {
    name: "stakeholder_registration_month",
    grain: "one row per stakeholder type per month with at least one registration",
    description:
      "Organisations registering interest in AI Amplify from the landing page (investors, government, corporates, universities, incubators). " +
      "Aggregated on purpose: individual registrations are named people and are not available.",
    columns: [
      { name: "stakeholder_type", type: "text", description: "See the stakeholder_type enum ('vc' = venture capital / investor)." },
      { name: "registration_month", type: "date", description: "First day of the month." },
      { name: "registrations", type: "integer", description: "" },
    ],
  },
];

/** What the data IS. A note stays true even if the reporting requirements change. */
const NOTES: string[] = [
  "Read only the views listed here, always addressed as ai.<view>. There is no other schema, and no base table behind these views that you can reach.",
  "Every id is an opaque uuid. There are no names, emails, phone numbers, bios, company names, links, notes, transcripts, answers or billing details anywhere in this schema. Learner-keyed views hold learners only (SME accounts) — never mentors or administrators.",
  "The views are live: every query reads the current data.",
  "Countries are English names ('United Arab Emirates', 'Nigeria', 'United Kingdom'); ISO codes from early sign-ups are already folded in. Group by country directly.",
  "A 'lesson' is one AI Amplify learning block. A course is completed when ai.course_progress.completed is true (progress reached 100%) — never use enrollment_status for completion.",
  "Learners have three AI learning-journey stacks besides courses: Learning Path (AI Amplify lessons; progress lives in ai.lesson_progress), Content on Demand (external videos/articles) and Blended Learning (both). ai.journey lists every journey started; ai.lesson_completion counts finished steps across all of them.",
  "ai.course_progress, ai.lesson_progress, ai.lesson_completion, ai.journey, ai.journey_item_progress, ai.activity_day and ai.mentor_session hold several rows per learner — joining one of them to ai.learner multiplies that learner's rows.",
  "Dates are calendar dates without a time zone; ai.activity_day.active_on is in the learner's own time zone.",
];

/** How a figure is computed, and house style. A rule about BEHAVIOUR, not the data. */
const INSTRUCTIONS: string[] = [
  "You answer questions about AI Amplify — Potential.org's AI program for small businesses, startups and job seekers — for a platform administrator, by writing PostgreSQL against this read-only, PII-free reporting schema and reading back the rows.",

  "COUNT PEOPLE WITH DISTINCT. Joining a several-rows-per-learner view to ai.learner and then COUNT(*) counts rows, not learners.\n" +
    "  WRONG — counts course rows:\n" +
    "    SELECT l.country, COUNT(*) AS learners FROM ai.learner l JOIN ai.course_progress p ON p.learner_id = l.learner_id GROUP BY l.country\n" +
    "  RIGHT — each learner once:\n" +
    "    SELECT l.country, COUNT(DISTINCT l.learner_id) AS learners FROM ai.learner l JOIN ai.course_progress p ON p.learner_id = l.learner_id GROUP BY l.country",

  "STANDARD FIGURES — use these definitions so answers match the admin dashboard: learners = COUNT(*) FROM ai.learner; active learners in a period = COUNT(DISTINCT learner_id) FROM ai.activity_day in that period; lessons completed = COUNT(*) FROM ai.lesson_completion; courses completed = COUNT(*) FROM ai.course_progress WHERE completed; journeys started = COUNT(*) FROM ai.journey (learners who started one = COUNT(DISTINCT learner_id)); mentor sessions = COUNT(*) FROM ai.mentor_session WHERE status <> 'cancelled'.",

  "DATE EACH THING BY ITS OWN EVENT: learners by signed_up_on (or signup_month), lessons by completed_on, courses by completed_on, journeys by started_on, exams by attempted_on, sessions by booked_on or starts_at, redemptions by redeemed_on. For a monthly trend use date_trunc('month', <date column>)::date and ORDER BY it.",

  "SMALL GROUPS: when a breakdown yields a group of fewer than five learners, give the count but do not describe that group's individual members or their combination of attributes.",

  "When the schema genuinely cannot answer — the data is excluded as personal or free text (names, contact details, exam transcripts, mentor notes, billing), or no view covers it — say so plainly in one sentence and name the closest thing it CAN answer. Never estimate or invent a figure.",

  "SHOW, DON'T LIST. When the answer is a breakdown, a ranking, a trend over time or a comparison, draw it with show_chart (one SELECT, with a chart type) instead of writing the numbers out as prose, then say in a sentence or two what the figure shows, citing it as 'Figure N'. Use run_sql for a single number or for working you do not need to show. Keep a figure to about a dozen categories — aggregate or LIMIT first.",

  "REPORTS ARE BUILT FROM FIGURES, AND A REQUEST FOR A REPORT ENDS WITH ONE. When the admin asks for a report: draw every item she or he lists as its own figure with show_chart — never run_sql, which draws nothing and spends the query budget a report needs. Then, in the SAME turn, call create_report citing the figure numbers the tools returned, each in the section it belongs to. Write the summary and the section text only from numbers the figures returned. After create_report, reply in a sentence or two; the report is in the card, not in your reply.",
];

/** Also the guard's allowlist — one array, two consumers. */
export function catalogViewNames(): string[] {
  return VIEWS.map((v) => v.name);
}

/**
 * The catalogue served at GET /api/admin/ai/catalog. `refreshedAt` is "now":
 * the views are plain views, so the data is as fresh as the query.
 */
export function buildSqlCatalog(now: Date = new Date()): SqlCatalog {
  return {
    version: SQL_CATALOG_VERSION,
    dialect: "postgresql",
    schema: "ai",
    refreshedAt: now.toISOString(),
    views: VIEWS,
    enums: ENUMS,
    notes: NOTES,
    instructions: INSTRUCTIONS,
    limits: {
      maxRows: MAX_ROWS,
      statementTimeoutMs: AI_STATEMENT_TIMEOUT_MS,
      maxQueriesPerTurn: MAX_QUERIES_PER_TURN,
    },
    chartTypes: [...AI_SQL_CHART_TYPES],
    chartDescriptors: [...CHART_DESCRIPTORS],
  };
}

/** True when the `ai` schema has been installed on this database. */
export async function isAiSchemaInstalled(): Promise<boolean> {
  try {
    const { rows } = await db.execute<{ ok: boolean }>(
      dsql`SELECT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'ai') AS ok`,
    );
    return rows[0]?.ok === true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* PII assertions (run by server/tests/ai-schema.test.ts)              */
/* ------------------------------------------------------------------ */

/**
 * Column names that must never appear in the `ai` schema, matched against the
 * LIVE catalogue rather than this file's descriptions — a view added later
 * that leaks a column fails even if nobody documented it. Anchored on `_` /
 * start / end so `learner_id` or `points_spent` do not false-positive.
 */
export const PII_COLUMN_PATTERNS: RegExp[] = [
  /(^|_)e?mail($|_)/i,
  /(^|_)phone($|_)/i,
  /(^|_)mobile($|_)/i,
  /(^|_)(first|last|full|display|user)_?name($|_)/i,
  /^name$/i,
  /(^|_)bio($|_)/i,
  /(^|_)company($|_)/i,
  /(^|_)representing($|_)/i,
  /(^|_)avatar/i,
  /(^|_)image(_url)?($|_)/i,
  /(^|_)cover($|_)/i,
  /(^|_)(meeting|recording|linkedin)_?(link|url)($|_)/i,
  /(^|_)link($|_)/i,
  /(^|_)url($|_)/i,
  /(^|_)website($|_)/i,
  /(^|_)notes?($|_)/i,
  /(^|_)transcript($|_)/i,
  /(^|_)feedback($|_)/i,
  /(^|_)scenario($|_)/i,
  /(^|_)strengths($|_)/i,
  /(^|_)improvements($|_)/i,
  /(^|_)answers?($|_)/i,
  /(^|_)passion($|_)/i,
  /(^|_)billing/i,
  /(^|_)stripe/i,
  /(^|_)payment_intent/i,
  /password|secret|api_key|token|hash/i,
  /(^|_)certificate_(number|url)($|_)/i,
  /(^|_)file_(path|name)($|_)/i,
  /(^|_)ip_address($|_)/i,
  /(^|_)user_agent($|_)/i,
  /(^|_)description($|_)/i,
];

export interface AiColumn {
  view: string;
  column: string;
  type: string;
}

/** Every column of every relation in the live `ai` schema. */
export async function liveAiColumns(): Promise<AiColumn[]> {
  const { rows } = await db.execute<{ view: string; column: string; type: string }>(dsql`
    SELECT c.relname AS view, a.attname AS column, format_type(a.atttypid, a.atttypmod) AS type
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'ai'
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
    WHERE c.relkind IN ('v', 'm', 'r')
    ORDER BY c.relname, a.attnum
  `);
  return rows;
}

/** Throws naming every live `ai` column whose NAME looks like personal data. */
export async function assertAiSchemaHasNoPii(): Promise<void> {
  const offenders = (await liveAiColumns()).filter(({ column }) => PII_COLUMN_PATTERNS.some((p) => p.test(column)));
  if (offenders.length > 0) {
    const list = offenders.map((o) => `ai.${o.view}.${o.column}`).join(", ");
    throw new Error(
      `The ai schema exposes columns that look like personal data: ${list}. ` +
        "Remove them from the view, or narrow the pattern if this is a genuine false positive.",
    );
  }
}
