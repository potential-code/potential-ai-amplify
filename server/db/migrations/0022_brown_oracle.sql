CREATE TYPE "public"."cod_content_progress_status" AS ENUM('not_started', 'in_progress', 'completed');--> statement-breakpoint
CREATE TYPE "public"."cod_content_status" AS ENUM('active', 'unavailable');--> statement-breakpoint
CREATE TYPE "public"."cod_content_type" AS ENUM('youtube', 'article');--> statement-breakpoint
CREATE TYPE "public"."cod_path_status" AS ENUM('building', 'active', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."cod_quiz_type" AS ENUM('pretest', 'posttest');--> statement-breakpoint
CREATE TABLE "cod_content_pool" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"url" text NOT NULL,
	"type" "cod_content_type" NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"source_query" text NOT NULL,
	"youtube_video_id" text,
	"channel_title" text,
	"duration_seconds" integer,
	"article_text" text,
	"published_at" timestamp,
	"quality_score" integer DEFAULT 0,
	"status" "cod_content_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "cod_content_pool_url_unique" UNIQUE("url")
);
--> statement-breakpoint
CREATE TABLE "cod_milestone_assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cod_user_path_id" uuid NOT NULL,
	"milestone_id" text NOT NULL,
	"milestone_title" text NOT NULL,
	"pretest_questions" jsonb,
	"questions" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "cod_milestone_assessments_cod_user_path_id_milestone_id_unique" UNIQUE("cod_user_path_id","milestone_id")
);
--> statement-breakpoint
CREATE TABLE "cod_path_content_refs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cod_user_path_id" uuid NOT NULL,
	"content_pool_id" uuid NOT NULL,
	"milestone_id" text NOT NULL,
	"order_in_milestone" integer DEFAULT 0 NOT NULL,
	"rationale" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cod_user_content_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"content_pool_id" uuid NOT NULL,
	"cod_user_path_id" uuid NOT NULL,
	"status" "cod_content_progress_status" DEFAULT 'not_started' NOT NULL,
	"video_watch_pct" integer DEFAULT 0,
	"completed_at" timestamp,
	CONSTRAINT "cod_user_content_progress_user_id_content_pool_id_cod_user_path_id_unique" UNIQUE("user_id","content_pool_id","cod_user_path_id")
);
--> statement-breakpoint
CREATE TABLE "cod_user_paths" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"platform_id" text DEFAULT 'smeep' NOT NULL,
	"discovery_profile" jsonb,
	"milestones" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "cod_path_status" DEFAULT 'building' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cod_user_quiz_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"cod_user_path_id" uuid NOT NULL,
	"milestone_id" text NOT NULL,
	"quiz_type" "cod_quiz_type" DEFAULT 'posttest' NOT NULL,
	"score" integer NOT NULL,
	"total_questions" integer NOT NULL,
	"passed" boolean NOT NULL,
	"attempt_number" integer DEFAULT 1 NOT NULL,
	"answers" jsonb,
	"completed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cod_milestone_assessments" ADD CONSTRAINT "cod_milestone_assessments_cod_user_path_id_cod_user_paths_id_fk" FOREIGN KEY ("cod_user_path_id") REFERENCES "public"."cod_user_paths"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cod_path_content_refs" ADD CONSTRAINT "cod_path_content_refs_cod_user_path_id_cod_user_paths_id_fk" FOREIGN KEY ("cod_user_path_id") REFERENCES "public"."cod_user_paths"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cod_path_content_refs" ADD CONSTRAINT "cod_path_content_refs_content_pool_id_cod_content_pool_id_fk" FOREIGN KEY ("content_pool_id") REFERENCES "public"."cod_content_pool"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cod_user_content_progress" ADD CONSTRAINT "cod_user_content_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cod_user_content_progress" ADD CONSTRAINT "cod_user_content_progress_content_pool_id_cod_content_pool_id_fk" FOREIGN KEY ("content_pool_id") REFERENCES "public"."cod_content_pool"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cod_user_content_progress" ADD CONSTRAINT "cod_user_content_progress_cod_user_path_id_cod_user_paths_id_fk" FOREIGN KEY ("cod_user_path_id") REFERENCES "public"."cod_user_paths"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cod_user_paths" ADD CONSTRAINT "cod_user_paths_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cod_user_quiz_results" ADD CONSTRAINT "cod_user_quiz_results_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cod_user_quiz_results" ADD CONSTRAINT "cod_user_quiz_results_cod_user_path_id_cod_user_paths_id_fk" FOREIGN KEY ("cod_user_path_id") REFERENCES "public"."cod_user_paths"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cod_path_content_refs_path_idx" ON "cod_path_content_refs" USING btree ("cod_user_path_id");--> statement-breakpoint
CREATE INDEX "cod_path_content_refs_milestone_idx" ON "cod_path_content_refs" USING btree ("cod_user_path_id","milestone_id");--> statement-breakpoint
CREATE INDEX "cod_user_paths_user_idx" ON "cod_user_paths" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "cod_quiz_results_user_path_idx" ON "cod_user_quiz_results" USING btree ("user_id","cod_user_path_id");