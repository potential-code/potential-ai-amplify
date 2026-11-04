CREATE TABLE "learner_activity_days" (
	"user_id" uuid NOT NULL,
	"day" date NOT NULL,
	"steps" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "learner_activity_days_user_id_day_pk" PRIMARY KEY("user_id","day")
);
--> statement-breakpoint
CREATE TABLE "mentor_mentee_notes" (
	"mentor_id" uuid NOT NULL,
	"mentee_id" uuid NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "mentor_mentee_notes_mentor_id_mentee_id_pk" PRIMARY KEY("mentor_id","mentee_id")
);
--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "category" text;--> statement-breakpoint
ALTER TABLE "mentor_sessions" ADD COLUMN "mentor_notes" text;--> statement-breakpoint
ALTER TABLE "learner_activity_days" ADD CONSTRAINT "learner_activity_days_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentor_mentee_notes" ADD CONSTRAINT "mentor_mentee_notes_mentor_id_users_id_fk" FOREIGN KEY ("mentor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentor_mentee_notes" ADD CONSTRAINT "mentor_mentee_notes_mentee_id_users_id_fk" FOREIGN KEY ("mentee_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

-- ── Course topics backfill ──────────────────────────────────────────────────
-- Assigns AI Amplify's English catalogue courses (SMEEP's list plus Amplify's AI and
-- business-growth courses) to one of the six COURSE_TOPICS by
-- title. Only fills courses that are still uncategorised, so an admin's later
-- choice is never overwritten. Unknown titles (including the Arabic catalogue) stay NULL (uncategorised).
UPDATE "courses" AS c
SET "category" = v.category
FROM (VALUES
	('24 Minute Accounting', 'Money and finance'),
	('Financial Literacy', 'Money and finance'),
	('Funding and Investment', 'Money and finance'),
	('Managing your Cash Flow', 'Money and finance'),

	('24 Minute Sales', 'Sales and customers'),
	('Call Center Essentials', 'Sales and customers'),
	('Customer Service', 'Sales and customers'),
	('Effective Customer Meetings', 'Sales and customers'),
	('Negotiation Skills', 'Sales and customers'),
	('Uncovering Customer Needs', 'Sales and customers'),

	('24 Minute Human Resources', 'People and leadership'),
	('Communication Skills', 'People and leadership'),
	('Corporate Social Responsibility (CSR)', 'People and leadership'),
	('Leadership Essentials', 'People and leadership'),
	('Presentation Skills', 'People and leadership'),
	('Project Management Essentials', 'People and leadership'),
	('Supervision Skills', 'People and leadership'),
	('Teamwork', 'People and leadership'),

	('24 Minute CIO', 'Digital and AI'),
	('AI for Growth: The Practical SME Guide', 'Digital and AI'),
	('Digital Content', 'Digital and AI'),
	('Digital Marketing', 'Digital and AI'),
	('Internet Research', 'Digital and AI'),
	('Online Productivity Tools', 'Digital and AI'),
	('Online Safety', 'Digital and AI'),
	('Online presence', 'Digital and AI'),
	('Podcast', 'Digital and AI'),
	('Social Media for Business', 'Digital and AI'),
	('Starting a Blog Online', 'Digital and AI'),

	('24 Minute MBA', 'Starting a business'),
	('Evolving Your Business', 'Starting a business'),
	('Expand your Business', 'Starting a business'),
	('Freelancing in Gig Economy', 'Starting a business'),
	('Innovation Design Thinking Course', 'Starting a business'),
	('SWOT Analysis', 'Starting a business'),
	('Startup your Business', 'Starting a business'),

	('Business Etiquette', 'Personal effectiveness'),
	('CV Writing', 'Personal effectiveness'),
	('Creative Thinking', 'Personal effectiveness'),
	('Critical Thinking', 'Personal effectiveness'),
	('Fitness For Business', 'Personal effectiveness'),
	('Interview Skills', 'Personal effectiveness'),
	('Nutrition Tips', 'Personal effectiveness'),
	('Optimizing Nutrition', 'Personal effectiveness'),
	('Planning and Time Management', 'Personal effectiveness'),
	('Problem Solving', 'Personal effectiveness'),
	('Productivity Skills', 'Personal effectiveness'),

	('AI Fundamentals', 'Digital and AI'),
	('AI Ethics and Data Privacy', 'Digital and AI'),
	('Generative AI, LLMs and Diffusion Models', 'Digital and AI'),
	('AI in Daily Workflows', 'Digital and AI'),
	('Prompt Engineering and AI Troubleshooting', 'Digital and AI'),
	('AI''s Future and Continuous Learning', 'Digital and AI'),

	('Launch your Business', 'Starting a business'),
	('Grow your Agricultural (Agri) Business', 'Starting a business'),
	('Grow your Hospitality Business', 'Starting a business'),
	('Grow your Manufacturing Business', 'Starting a business'),
	('Grow your Retail Business', 'Starting a business'),
	('Grow your Social Business', 'Starting a business'),
	('Women Entrepreneurship', 'Starting a business'),
	('SME- Women Entrepreneurship Program', 'Starting a business')
) AS v(title, category)
WHERE lower(trim(c."title")) = lower(v.title) AND c."category" IS NULL;--> statement-breakpoint
-- ── Learning streak backfill ────────────────────────────────────────────────
-- Rebuilds per-day step counts from every existing progress table so streaks
-- reflect real history. Each completion is bucketed into the learner's own
-- calendar day (users.timezone if it is a valid IANA name, else UTC).
--
-- Timestamp columns are `timestamp without time zone`. Columns the app writes
-- explicitly from JS (`new Date()`) hold UTC; columns filled by the
-- `DEFAULT now()` (quiz results) hold the DB session's local
-- time, so they are interpreted in current_setting('TimeZone').
--
-- (AI Amplify's Blended items don't mirror into course progress, so every
-- completed item counts once.)
--
-- Idempotent: re-running keeps the larger of the stored and recomputed count.
WITH tz AS (
	SELECT u."id" AS user_id,
		CASE WHEN u."timezone" IN (SELECT "name" FROM pg_timezone_names) THEN u."timezone" ELSE 'UTC' END AS zone
	FROM "users" u
),
events AS (
	SELECT p."user_id", (p."completed_at" AT TIME ZONE 'UTC') AS at
	FROM "user_learning_block_progress" p
	WHERE p."status" = 'completed' AND p."completed_at" IS NOT NULL
	UNION ALL
	SELECT p."user_id", (p."completed_at" AT TIME ZONE 'UTC')
	FROM "cod_user_content_progress" p
	WHERE p."status" = 'completed' AND p."completed_at" IS NOT NULL
	UNION ALL
	SELECT p."user_id", (p."completed_at" AT TIME ZONE 'UTC')
	FROM "both_user_item_progress" p
	WHERE p."status" = 'completed' AND p."completed_at" IS NOT NULL

	UNION ALL
	SELECT a."user_id", (a."completed_at" AT TIME ZONE 'UTC')
	FROM "assessment_attempts" a
	WHERE a."completed_at" IS NOT NULL
	UNION ALL
	SELECT r."user_id", (r."completed_at" AT TIME ZONE current_setting('TimeZone'))
	FROM "cod_user_quiz_results" r
	UNION ALL
	SELECT r."user_id", (r."completed_at" AT TIME ZONE current_setting('TimeZone'))
	FROM "both_user_quiz_results" r
)
INSERT INTO "learner_activity_days" ("user_id", "day", "steps")
SELECT e."user_id", (e.at AT TIME ZONE tz.zone)::date AS day, count(*)::int AS steps
FROM events e
JOIN tz ON tz.user_id = e."user_id"
GROUP BY e."user_id", (e.at AT TIME ZONE tz.zone)::date
ON CONFLICT ("user_id", "day") DO UPDATE
	SET "steps" = GREATEST("learner_activity_days"."steps", EXCLUDED."steps");
