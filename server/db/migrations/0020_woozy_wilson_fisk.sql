CREATE TYPE "public"."learning_path_status" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."learning_question_type" AS ENUM('single', 'multi', 'scale', 'text');--> statement-breakpoint
CREATE TABLE "learning_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform_id" text DEFAULT 'smeep' NOT NULL,
	"prompt" text NOT NULL,
	"type" "learning_question_type" NOT NULL,
	"options" text[],
	"order" integer DEFAULT 0 NOT NULL,
	"setup_version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "learning_theme_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"theme_id" uuid NOT NULL,
	"learning_block_id" uuid NOT NULL,
	"order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "learning_themes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform_id" text DEFAULT 'smeep' NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"order" integer DEFAULT 0 NOT NULL,
	"setup_version" integer DEFAULT 1 NOT NULL,
	"generated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_learning_path" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"platform_id" text DEFAULT 'smeep' NOT NULL,
	"status" "learning_path_status" DEFAULT 'active' NOT NULL,
	"based_on_setup_version" integer DEFAULT 1 NOT NULL,
	"generated_at" timestamp DEFAULT now() NOT NULL,
	"milestones" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_questionnaire_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"answers" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "learning_theme_blocks" ADD CONSTRAINT "learning_theme_blocks_theme_id_learning_themes_id_fk" FOREIGN KEY ("theme_id") REFERENCES "public"."learning_themes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_theme_blocks" ADD CONSTRAINT "learning_theme_blocks_learning_block_id_learning_blocks_id_fk" FOREIGN KEY ("learning_block_id") REFERENCES "public"."learning_blocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_learning_path" ADD CONSTRAINT "user_learning_path_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_questionnaire_answers" ADD CONSTRAINT "user_questionnaire_answers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "learning_theme_blocks_theme_idx" ON "learning_theme_blocks" USING btree ("theme_id");--> statement-breakpoint
CREATE INDEX "user_learning_path_user_idx" ON "user_learning_path" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_questionnaire_answers_user_idx" ON "user_questionnaire_answers" USING btree ("user_id");