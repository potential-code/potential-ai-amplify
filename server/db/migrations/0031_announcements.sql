CREATE TABLE "announcements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"link_url" text,
	"link_label" text,
	"audience" text DEFAULT 'learners' NOT NULL,
	"show_banner" boolean DEFAULT true NOT NULL,
	"banner_until" timestamp,
	"notified" boolean DEFAULT false NOT NULL,
	"emailed" boolean DEFAULT false NOT NULL,
	"email_recipients" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"archived_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "announcement_emails" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "announcements_created_idx" ON "announcements" USING btree ("created_at");