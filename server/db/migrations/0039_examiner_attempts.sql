CREATE TABLE "examiner_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"mode" text NOT NULL,
	"scenario" text NOT NULL,
	"overall_score" integer NOT NULL,
	"dimensions" jsonb NOT NULL,
	"strengths" jsonb NOT NULL,
	"improvements" jsonb NOT NULL,
	"feedback" text NOT NULL,
	"transcript" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "examiner_attempts" ADD CONSTRAINT "examiner_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "examiner_attempts" ADD CONSTRAINT "examiner_attempts_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "examiner_attempts_user_created_idx" ON "examiner_attempts" USING btree ("user_id","created_at");