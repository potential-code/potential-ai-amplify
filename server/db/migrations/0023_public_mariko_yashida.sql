CREATE TYPE "public"."both_content_status" AS ENUM('active', 'unavailable');--> statement-breakpoint
CREATE TYPE "public"."both_content_type" AS ENUM('youtube', 'article');--> statement-breakpoint
CREATE TYPE "public"."both_item_progress_status" AS ENUM('not_started', 'in_progress', 'completed');--> statement-breakpoint
CREATE TYPE "public"."both_item_type" AS ENUM('external', 'internal');--> statement-breakpoint
CREATE TYPE "public"."both_path_status" AS ENUM('building', 'active', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."both_quiz_type" AS ENUM('pretest', 'posttest');--> statement-breakpoint
CREATE TABLE "both_content_pool" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"url" text NOT NULL,
	"type" "both_content_type" NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"source_query" text NOT NULL,
	"youtube_video_id" text,
	"channel_title" text,
	"duration_seconds" integer,
	"article_text" text,
	"published_at" timestamp,
	"quality_score" integer DEFAULT 0,
	"status" "both_content_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "both_content_pool_url_unique" UNIQUE("url")
);
--> statement-breakpoint
CREATE TABLE "both_milestone_assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"both_user_path_id" uuid NOT NULL,
	"milestone_id" text NOT NULL,
	"milestone_title" text NOT NULL,
	"pretest_questions" jsonb,
	"questions" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "both_milestone_assessments_both_user_path_id_milestone_id_unique" UNIQUE("both_user_path_id","milestone_id")
);
--> statement-breakpoint
CREATE TABLE "both_path_block_refs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"both_user_path_id" uuid NOT NULL,
	"block_id" uuid NOT NULL,
	"milestone_id" text NOT NULL,
	"order_in_milestone" integer DEFAULT 0 NOT NULL,
	"rationale" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "both_path_content_refs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"both_user_path_id" uuid NOT NULL,
	"content_pool_id" uuid NOT NULL,
	"milestone_id" text NOT NULL,
	"order_in_milestone" integer DEFAULT 0 NOT NULL,
	"rationale" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "both_user_item_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"item_type" "both_item_type" NOT NULL,
	"item_id" uuid NOT NULL,
	"both_user_path_id" uuid NOT NULL,
	"milestone_id" text NOT NULL,
	"status" "both_item_progress_status" DEFAULT 'not_started' NOT NULL,
	"video_watch_pct" integer DEFAULT 0,
	"completed_at" timestamp,
	CONSTRAINT "both_user_item_progress_user_id_item_type_item_id_both_user_path_id_unique" UNIQUE("user_id","item_type","item_id","both_user_path_id")
);
--> statement-breakpoint
CREATE TABLE "both_user_paths" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"platform_id" text DEFAULT 'smeep' NOT NULL,
	"discovery_profile" jsonb,
	"milestones" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "both_path_status" DEFAULT 'building' NOT NULL,
	"internal_block_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "both_user_quiz_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"both_user_path_id" uuid NOT NULL,
	"milestone_id" text NOT NULL,
	"quiz_type" "both_quiz_type" DEFAULT 'posttest' NOT NULL,
	"score" integer NOT NULL,
	"total_questions" integer NOT NULL,
	"passed" boolean NOT NULL,
	"attempt_number" integer DEFAULT 1 NOT NULL,
	"answers" jsonb,
	"completed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "both_milestone_assessments" ADD CONSTRAINT "both_milestone_assessments_both_user_path_id_both_user_paths_id_fk" FOREIGN KEY ("both_user_path_id") REFERENCES "public"."both_user_paths"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "both_path_block_refs" ADD CONSTRAINT "both_path_block_refs_both_user_path_id_both_user_paths_id_fk" FOREIGN KEY ("both_user_path_id") REFERENCES "public"."both_user_paths"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "both_path_content_refs" ADD CONSTRAINT "both_path_content_refs_both_user_path_id_both_user_paths_id_fk" FOREIGN KEY ("both_user_path_id") REFERENCES "public"."both_user_paths"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "both_path_content_refs" ADD CONSTRAINT "both_path_content_refs_content_pool_id_both_content_pool_id_fk" FOREIGN KEY ("content_pool_id") REFERENCES "public"."both_content_pool"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "both_user_item_progress" ADD CONSTRAINT "both_user_item_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "both_user_item_progress" ADD CONSTRAINT "both_user_item_progress_both_user_path_id_both_user_paths_id_fk" FOREIGN KEY ("both_user_path_id") REFERENCES "public"."both_user_paths"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "both_user_paths" ADD CONSTRAINT "both_user_paths_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "both_user_quiz_results" ADD CONSTRAINT "both_user_quiz_results_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "both_user_quiz_results" ADD CONSTRAINT "both_user_quiz_results_both_user_path_id_both_user_paths_id_fk" FOREIGN KEY ("both_user_path_id") REFERENCES "public"."both_user_paths"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "both_path_block_refs_path_idx" ON "both_path_block_refs" USING btree ("both_user_path_id");--> statement-breakpoint
CREATE INDEX "both_path_block_refs_milestone_idx" ON "both_path_block_refs" USING btree ("both_user_path_id","milestone_id");--> statement-breakpoint
CREATE INDEX "both_path_content_refs_path_idx" ON "both_path_content_refs" USING btree ("both_user_path_id");--> statement-breakpoint
CREATE INDEX "both_path_content_refs_milestone_idx" ON "both_path_content_refs" USING btree ("both_user_path_id","milestone_id");--> statement-breakpoint
CREATE INDEX "both_user_paths_user_idx" ON "both_user_paths" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "both_quiz_results_user_path_idx" ON "both_user_quiz_results" USING btree ("user_id","both_user_path_id");